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
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

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
          status: "active",
        });

        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({
          message: "Failed to create startup",
          error: error.message,
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
