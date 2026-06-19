const express = require("express");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require("mongodb");
dotenv.config();
const cors = require("cors");
const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db(process.env.AUTH_DB_NAME);
    const startupsCollection = db.collection("startups");
    const opportunitiesCollection = db.collection("opportunities");

    app.get("/api/startup/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const result = await startupsCollection.findOne({
          founderEmail: email,
        });

        if (!result) {
          return res.status(200).json(null);
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.post("/api/startups", async (req, res) => {
      try {
        const { founderEmail } = req.body;

        const existingStartup = await startupsCollection.findOne({
          founderEmail,
        });
        if (existingStartup) {
          return res.status(400).json({
            message:
              "A startup has already been registered with this email address.",
          });
        }

        const result = await startupsCollection.insertOne({
          ...req.body,
          createdAt: new Date(),
          status: "pending",
        });

        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({
          message: "Failed to create startup",
          error: error.message,
        });
      }
    });

    // Update Startup Info by Email (Email update kora jabe na)
    app.put("/api/startup/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const { startupName, logo, industry, description, fundingStage } =
          req.body;

        // Filter validation: email jeno body theke update na hoy
        const updateDoc = {
          $set: {
            startupName,
            logo,
            industry,
            description,
            fundingStage,
            updatedAt: new Date(),
          },
        };

        const result = await startupsCollection.updateOne(
          { founderEmail: email },
          updateDoc,
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Startup not found" });
        }

        res
          .status(200)
          .json({ message: "Startup updated successfully!", result });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Failed to update startup", error: error.message });
      }
    });

    app.delete("/api/startup/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const result = await startupsCollection.deleteOne({
          founderEmail: email,
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ error: true, message: "Startup not found to delete" });
        }

        res.status(200).json({
          error: false,
          message: "Startup wiped out successfully from network!",
        });
      } catch (error) {
        res.status(500).json({
          error: true,
          message: "Failed to delete startup",
          error: error.message,
        });
      }
    });

    // 🆕 Create New Opportunity API (With Status Checking)
    app.post("/api/opportunities", async (req, res) => {
      try {
        const opportunityData = req.body;
        const { founderEmail } = opportunityData;

        // ১. সুযোগ তৈরি করার আগে স্টার্টআপের স্ট্যাটাস চেক করা হচ্ছে
        const startup = await startupsCollection.findOne({ founderEmail });

        if (!startup) {
          return res.status(404).json({
            success: false,
            message: "No registered startup profile found for this user.",
          });
        }

        // ২. স্ট্যাটাস যদি 'active' না হয়, তবে রিকোয়েস্ট রিজেক্ট করা হবে
        if (startup.status !== "active") {
          return res.status(403).json({
            success: false,
            message: `Your startup status is '${startup.status}'. You can only post opportunities when it is 'active'.`,
          });
        }

        // ৩. স্ট্যাটাস 'active' হলে ডাটাবেজে ইনসার্ট করা হচ্ছে
        const result = await opportunitiesCollection.insertOne({
          ...opportunityData,
          createdAt: new Date(),
        });

        res.status(201).json({
          success: true,
          message: "Opportunity deployed successfully!",
          insertedId: result.insertedId, // ফ্রন্টএন্ডের চেকিংয়ের সুবিধার্থে
          result,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Failed to create opportunity",
          error: error.message,
        });
      }
    });

    app.get("/api/opportunities/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const result = await opportunitiesCollection
          .find({ founderEmail: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.put("/api/opportunity/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const {
          roleTitle,
          requiredSkills,
          workType,
          commitmentLevel,
          deadline,
        } = req.body;
        const { ObjectId } = require("mongodb");

        const updateDoc = {
          $set: {
            roleTitle,
            requiredSkills,
            workType,
            commitmentLevel,
            deadline,
            updatedAt: new Date(),
          },
        };

        const result = await opportunitiesCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc,
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Opportunity not found" });
        }
        res.status(200).json({
          success: true,
          message: "Opportunity updated successfully!",
        });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ৩. অপরচুনিটি ডিলিট করা
    // app.delete("/api/opportunity/:id", async (req, res) => {
    //   try {
    //     const { id } = req.params;
    //     const { ObjectId } = require("mongodb");
    //     const result = await opportunitiesCollection.deleteOne({
    //       _id: new ObjectId(id),
    //     });

    //     if (result.deletedCount === 0) {
    //       return res
    //         .status(404)
    //         .json({ success: false, message: "Opportunity not found" });
    //     }
    //     res
    //       .status(200)
    //       .json({
    //         success: true,
    //         message: "Opportunity deleted successfully!",
    //       });
    //   } catch (error) {
    //     res.status(500).json({ success: false, message: error.message });
    //   }
    // });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
