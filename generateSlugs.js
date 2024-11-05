const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.camyj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

async function generateAndSaveSlugs() {
  try {
    await client.connect();
    const productCollection = client.db("Trendy_management").collection("Product");
    
    const products = await productCollection.find({}).toArray();

    for (const product of products) {
      const updatedSubproducts = product.parentcode.subproduct.map((subproduct) => {
        if (!subproduct.slug && subproduct.name) { // Check if name exists
          subproduct.slug = generateSlug(subproduct.name);
        }
        return subproduct;
      });

      await productCollection.updateOne(
        { _id: product._id },
        { $set: { "parentcode.subproduct": updatedSubproducts } }
      );
    }

    console.log("Slugs generated and saved for all products.");
  } catch (error) {
    console.error("Error generating slugs:", error);
  } finally {
    await client.close();
  }
}

function generateSlug(name) {
  if (!name) return ""; // Return empty string if name is null or undefined
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

generateAndSaveSlugs();
