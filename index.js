const express = require("express");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();
const cors = require("cors");
const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());

const logger = (req, res, next) => {
  console.log("logger logged", req.params);
  next();
};

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
    const usersCollection = db.collection("user");
    const paymentsCollection = db.collection("payments");
    const applicationsCollection = db.collection("applications");
    const notificationsCollection = db.collection("notifications");
    const sessionCollection = db.collection("session");

    // Verification Related

    const verifyToken = async (req, res, next) => {
      const token = req.headers.authorization?.split(" ")[1];

      console.log("TOKEN:", token);

      if (!token) {
        return res.status(401).send({
          success: false,
          message: "Unauthorized Access",
        });
      }

      const query = { token: token };
      const session = await sessionCollection.findOne(query);
      console.log("Session User ID:", session?.userId);

      const userId = session.userId;

      const userQuery = {
        _id: userId,
      };

      const user = await usersCollection.findOne(userQuery);
      // set data in the req object
      req.user = user;

      console.log("DB User ID:", user?._id);

      next();
    };

    const verifyCollaborator = async (req, res, next) => {
      const requestedEmail = req.params.email;

      console.log("Token User Email:", req.user?.email);
      console.log("Requested Email:", requestedEmail);

      if (req.user?.email !== requestedEmail) {
        return res.status(403).send({
          success: false,
          message: "Forbidden Access",
        });
      }

      next();
    };

    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).send({
          success: false,
          message: "Forbidden Access",
        });
      }

      next();
    };

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

    // Get all APPROVED startups for Browse Page
    app.get("/api/startups/approved", async (req, res) => {
      try {
        const result = await startupsCollection
          .find({ status: "approved" })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        res
          .status(500)
          .send({ error: "Internal Server Error", message: error.message });
      }
    });

    app.post("/api/opportunities", async (req, res) => {
      try {
        const opportunityData = req.body;
        const { founderEmail } = opportunityData;

        const founder = await usersCollection.findOne({ email: founderEmail });

        const userOpportunities = await opportunitiesCollection
          .find({ founderEmail: founderEmail })
          .sort({ createdAt: -1 })
          .toArray();

        let total = userOpportunities.length;

        if (!founder?.isPremium && total >= 3) {
          const latestOpportunity = userOpportunities[0];
          const lastPostDate = new Date(latestOpportunity.createdAt);
          const currentDate = new Date();
          const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

          if (currentDate - lastPostDate >= thirtyDaysInMs) {
            total = 0;
          }
        }

        if (!founder?.isPremium && total >= 3) {
          return res.status(401).send({
            message:
              "Your free limit is over. Please wait 1 month from your last post to get a reset.",
          });
        }

        const startup = await startupsCollection.findOne({ founderEmail });

        if (!startup) {
          return res.status(404).json({
            success: false,
            message: "No registered startup profile found for this user.",
          });
        }

        if (startup.status !== "approved") {
          return res.status(403).json({
            success: false,
            message: `Your startup status is '${startup.status}'. You can only post opportunities when it is 'approved'.`,
          });
        }

        const result = await opportunitiesCollection.insertOne({
          ...opportunityData,
          founderName: founder?.name,
          createdAt: new Date(),
        });

        res.status(201).json({
          success: true,
          message: "Opportunity deployed successfully!",
          insertedId: result.insertedId,
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

    // Get Opportunities by Startup ID
    app.get("/api/opportunities/startup/:startupId", async (req, res) => {
      try {
        const { startupId } = req.params;

        if (!startupId || startupId === "undefined") {
          return res.status(200).json([]);
        }

        const cleanId = startupId.trim();

        const result = await opportunitiesCollection
          .find({ startupId: cleanId })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        res
          .status(500)
          .send({ error: "Internal Server Error", message: error.message });
      }
    });

    app.get("/api/opportunities/count/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const founder = await usersCollection.findOne({ email });

        const userOpportunities = await opportunitiesCollection
          .find({ founderEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        let total = userOpportunities.length;
        let isReseted = false;

        if (!founder?.isPremium && total >= 3) {
          const latestOpportunity = userOpportunities[0];
          const lastPostDate = new Date(latestOpportunity.createdAt);
          const currentDate = new Date();

          const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

          if (currentDate - lastPostDate >= thirtyDaysInMs) {
            total = 0;
            isReseted = true;
          }
        }

        res.send({
          isPremium: founder?.isPremium || false,
          total: total,
          limit: founder?.isPremium ? null : 3,
          remaining: founder?.isPremium ? null : Math.max(0, 3 - total),
          isReseted,
        });
      } catch (error) {
        res.status(500).send({ message: error.message });
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

    // Get Single Opportunity By ID
    app.get("/api/opportunity/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await opportunitiesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res.status(404).json({
            success: false,
            message: "Opportunity not found",
          });
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
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

    app.delete("/api/opportunity/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await opportunitiesCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Opportunity not found" });
        }
        res.status(200).json({
          success: true,
          message: "Opportunity deleted successfully!",
        });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.patch("/api/users/upgrade-premium/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const result = await usersCollection.updateOne(
          { email },
          {
            $set: {
              isPremium: true,
              premiumAt: new Date(),
            },
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        res.send({
          success: true,
          message: "Premium upgraded",
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Get all opportunities for Browse Page
    app.get("/api/opportunities", async (req, res) => {
      try {
        const { search, workType, commitmentLevel } = req.query;

        const query = {};

        if (search) {
          query.roleTitle = {
            $regex: search,
            $options: "i",
          };
        }

        if (workType) {
          query.workType = workType;
        }

        if (commitmentLevel) {
          query.commitmentLevel = commitmentLevel;
        }

        const result = await opportunitiesCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({
          error: "Internal Server Error",
          message: error.message,
        });
      }
    });

    // Applications Methods
    app.post("/api/apply", async (req, res) => {
      try {
        const { email, opportunityId, ...rest } = req.body;

        const existing = await applicationsCollection.findOne({
          email,
          opportunityId,
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: "Already applied",
          });
        }

        const result = await applicationsCollection.insertOne({
          email,
          opportunityId,
          ...rest,
          status: "pending",
          appliedAt: new Date(),
        });

        res.status(201).json({
          success: true,
          message: "Application submitted successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    // Get Applications for Founder's Opportunities
    app.get("/api/founder/applications/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const opportunities = await opportunitiesCollection
          .find({ founderEmail: email })
          .toArray();
        const opportunityIds = opportunities.map((op) => op._id.toString());

        const result = await applicationsCollection
          .find({ opportunityId: { $in: opportunityIds } })
          .sort({ appliedAt: -1 })
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // update status of applications -- accept & reject
    app.patch("/api/application/status/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        const application = await applicationsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!application) {
          return res.status(404).json({
            success: false,
            message: "Application not found",
          });
        }

        await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          },
        );

        // Notification Create
        await notificationsCollection.insertOne({
          email: application.email,
          applicationId: id,
          type: status,
          title:
            status === "accepted"
              ? "Application Accepted"
              : "Application Rejected",
          message:
            status === "accepted"
              ? `Your application for ${application.roleTitle} has been accepted.`
              : `Your application for ${application.roleTitle} has been rejected.`,
          isRead: false,
          createdAt: new Date(),
        });

        res.send({
          success: true,
          message: `Application ${status} successfully!`,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Get Notification Api
    app.get("/api/notifications/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const result = await notificationsCollection
          .find({ email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Read Notification Api
    app.patch("/api/notifications/read/:id", async (req, res) => {
      try {
        const { id } = req.params;

        await notificationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              isRead: true,
            },
          },
        );

        res.send({
          success: true,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Get only logged-in user's applications
    app.get(
      "/api/user/applications/:email",
      verifyToken,
      verifyCollaborator,

      async (req, res) => {
        try {
          const { email } = req.params;

          const result = await applicationsCollection
            .find({ email })
            .sort({ appliedAt: -1 })
            .toArray();

          res.status(200).send(result);
        } catch (error) {
          res.status(500).send({
            success: false,
            message: error.message,
          });
        }
      },
    );

    // Payment Related Api
    app.post("/api/payments", async (req, res) => {
      try {
        const payment = req.body;

        const result = await paymentsCollection.insertOne(payment);

        res.send({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Get All Users
    app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.send(users);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Block / Unblock User
    app.patch(
      "/api/users/block/:id",
      logger,
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { isBlocked } = req.body;

          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                isBlocked,
              },
            },
          );

          if (result.matchedCount === 0) {
            return res.status(404).send({
              success: false,
              message: "User not found",
            });
          }

          res.send({
            success: true,
            message: isBlocked
              ? "User blocked successfully"
              : "User unblocked successfully",
          });
        } catch (error) {
          res.status(500).send({
            success: false,
            message: error.message,
          });
        }
      },
    );

    // Get all startups (ADMIN)
    app.get("/api/startups", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await startupsCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.patch(
      "/api/startup/status/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { status } = req.body;

          const result = await startupsCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status,
                updatedAt: new Date(),
              },
            },
          );

          res.send({
            success: true,
            message: `Startup ${status} successfully`,
          });
        } catch (error) {
          res.status(500).send({
            success: false,
            message: error.message,
          });
        }
      },
    );

    // Get All Transactions (ADMIN)
    app.get("/api/payments", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await paymentsCollection
          .find({})
          .sort({ paid_at: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Founder Dashboard Stats
    app.get("/api/founder/dashboard/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const [totalOpportunities, applications] = await Promise.all([
          opportunitiesCollection.countDocuments({ founderEmail: email }),
          applicationsCollection.find({}).sort({ appliedAt: 1 }).toArray(),
        ]);

        // founder এর opportunity id বের করা
        const opportunities = await opportunitiesCollection
          .find({ founderEmail: email })
          .toArray();

        const opportunityIds = opportunities.map((op) => op._id.toString());

        const founderApplications = applications.filter((app) =>
          opportunityIds.includes(app.opportunityId),
        );

        const totalApplications = founderApplications.length;

        const acceptedApplications = founderApplications.filter(
          (app) => app.status === "accepted",
        ).length;

        // Monthly chart
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

        const chartData = months.map((month, index) => {
          const opp = opportunities.filter(
            (o) => new Date(o.createdAt).getMonth() === index,
          ).length;

          const apps = founderApplications.filter(
            (a) => new Date(a.appliedAt).getMonth() === index,
          ).length;

          const accepted = founderApplications.filter(
            (a) =>
              new Date(a.appliedAt).getMonth() === index &&
              a.status === "accepted",
          ).length;

          return {
            month,
            Opportunities: opp,
            Applications: apps,
            Accepted: accepted,
          };
        });

        res.send({
          stats: {
            totalOpportunities,
            totalApplications,
            acceptedApplications,
          },
          chartData,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    // Admin Dashboard Overview Stats
    app.get("/api/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const [totalUsers, totalStartups, totalOpportunities, payments] =
          await Promise.all([
            usersCollection.countDocuments(),
            startupsCollection.countDocuments(),
            opportunitiesCollection.countDocuments(),
            paymentsCollection.find({ payment_status: "paid" }).toArray(),
          ]);

        const totalRevenue = payments.reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0,
        );

        res.send({
          totalUsers,
          totalStartups,
          totalOpportunities,
          totalRevenue,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

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
