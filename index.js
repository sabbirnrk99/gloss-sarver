const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const multer = require("multer");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const bodyParser = require("body-parser");
const XLSX = require("xlsx");

const port = process.env.PORT || 4000;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://glamersbd.web.app",
      "https://glameersbd.com",

      "http://localhost:3000/",
      "https://trendy-management.web.app",
      "https://trendy-management.firebaseapp.com",
    ],
    credentials: true,
  })
);
// Increase request size limit
app.use(express.json({ limit: "20mb" })); // Adjust the size as needed
app.use(express.urlencoded({ limit: "20mb", extended: true }));
app.use(express.json());
app.use(bodyParser.json());
// Set up multer for file storage
const upload = multer({ dest: "uploads/" }); // 'uploads/' directory will store the files temporarily

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@glossandglows.u7fodab.mongodb.net/?retryWrites=true&w=majority&appName=glossandglows`;

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
    // Connect the client to the server
    await client.connect();
    // console.log("Connected to MongoDB!");

    const database = client.db("Trendy_management");
    const productCollection = database.collection("Product");
    const ordersCollection = database.collection("OrderManagement");
    const facebookPagesCollection = database.collection("FacebookPages");
    const usersCollection = database.collection("Users");
    const redxAreaCollection = database.collection("RedxArea");
    const pathaowAreaCollection = database.collection("PathaowArea");
    const steadFastPaymentCollection = database.collection("SteadFastPayment");
    const redxPaymentCollection = database.collection("RedxPayment");
    const categoryCollection = database.collection("Category");

    // API Route to get products by subcategory name
    app.get("/api/products/subcategory/:subcategory", async (req, res) => {
      const { subcategory } = req.params; // e.g., "Laptops"
      try {
        const products = await productCollection
          .find({
            "parentcode.subproduct": {
              $elemMatch: {
                subcategory: subcategory, // Filter by subcategory
                status: "Website", // Filter by status
              },
            },
          })
          .toArray();

        // Filter subproducts matching the specified subcategory and status
        const filteredProducts = products
          .map((product) => ({
            ...product,
            subproduct: product.parentcode.subproduct.filter(
              (sub) =>
                sub.subcategory === subcategory && sub.status === "Website"
            ),
          }))
          .filter((p) => p.subproduct.length > 0); // Only include products with matching subproducts

        res.json({ products: filteredProducts });
      } catch (error) {
        console.error("Error fetching products by subcategory:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch products by subcategory" });
      }
    });

    app.get("/api/products/category/:categoryName", async (req, res) => {
      const { categoryName } = req.params;
      try {
        // Find products that have the specified category name
        const products = await productCollection
          .find({ "parentcode.subproduct.category": categoryName })
          .toArray();

        res.json({ products });
      } catch (error) {
        console.error("Error fetching products by category:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch products by category" });
      }
    });

    // Add this route to your backend `index.js`
    app.get("/api/category/:categoryName/products", async (req, res) => {
      try {
        const { categoryName } = req.params;
        const limit = parseInt(req.query.limit) || 4;

        // Query for products with the specified category and status "Website"
        const products = await productCollection
          .find({
            "parentcode.subproduct.category": categoryName,
            "parentcode.subproduct.status": "Website",
          })
          .limit(limit)
          .toArray();

        // Filter the subproducts by the category name and status
        const filteredProducts = products
          .map((product) => ({
            ...product,
            parentcode: {
              ...product.parentcode,
              subproduct: product.parentcode.subproduct.filter(
                (sub) =>
                  sub.category === categoryName && sub.status === "Website"
              ),
            },
          }))
          .filter((p) => p.parentcode.subproduct.length > 0);

        res.status(200).json({ products: filteredProducts });
      } catch (error) {
        console.error("Error fetching products by category:", error);
        res.status(500).json({ message: "Failed to fetch products" });
      }
    });

    // Fetch detailed category information, including subcategories
    app.get("/api/categories/details", async (req, res) => {
      try {
        const categories = await database
          .collection("Category")
          .find({})
          .toArray();
        res.status(200).json({ categories });
      } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: "Failed to fetch categories" });
      }
    });

    

// Delete Subcategory or Entire Parent Category
app.delete("/api/categories", async (req, res) => {
  const { parentCategoryId, subCategorySlug } = req.body;

  try {
    if (subCategorySlug) {
      // Remove the specific subcategory by its slug
      const updateResult = await categoryCollection.updateOne(
        { _id: new ObjectId(parentCategoryId) },
        { $pull: { subcategories: { slug: subCategorySlug } } }
      );

      if (updateResult.modifiedCount === 0) {
        return res.status(404).json({ message: "Subcategory not found" });
      }
      res.status(200).json({ message: "Subcategory deleted successfully" });
    } else {
      // Remove the entire parent category using its _id
      const deleteResult = await categoryCollection.deleteOne({
        _id: new ObjectId(parentCategoryId),
      });

      if (deleteResult.deletedCount === 0) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.status(200).json({ message: "Category deleted successfully" });
    }
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ message: "Failed to delete category", error });
  }
});

    // Add subcategory to a parent category
    app.post("/api/categories/add-subcategory", async (req, res) => {
      const { parentCategory, subCategory, subCategorySlug } = req.body;

      if (!parentCategory || !subCategory || !subCategorySlug) {
        return res.status(400).json({
          message: "Parent category, subcategory, and slug are required",
        });
      }

      try {
        const result = await database.collection("Category").updateOne(
          { mainCategory: parentCategory },
          {
            $push: {
              subcategories: {
                name: subCategory,
                slug: subCategorySlug,
              },
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Parent category not found" });
        }

        res.status(201).json({ message: "Subcategory added successfully" });
      } catch (error) {
        console.error("Error adding subcategory:", error);
        res.status(500).json({ message: "Failed to add subcategory" });
      }
    });

    // Category collection route
    app.post("/api/categories", async (req, res) => {
      const { mainCategory, mainCategorySlug } = req.body;

      if (!mainCategory || !mainCategorySlug) {
        return res
          .status(400)
          .json({ message: "Main category and slug are required" });
      }

      try {
        const newCategory = {
          mainCategory,
          mainCategorySlug,
          subcategories: [], // Initialize with an empty array for potential subcategories later
        };

        await database.collection("Category").insertOne(newCategory);
        res.status(201).json({ message: "Main category added successfully" });
      } catch (error) {
        console.error("Error adding category:", error);
        res.status(500).json({ message: "Failed to add category" });
      }
    });

    app.get("/api/categories/main", async (req, res) => {
      try {
        // Fetch main categories with proper structure
        const categories = await categoryCollection
          .find({}, { projection: { mainCategory: 1, mainCategorySlug: 1 } })
          .toArray();

        // Format categories to include mainCategory and mainCategorySlug correctly
        const formattedCategories = categories.map((category) => ({
          _id: category._id,
          name: category.mainCategory, // map mainCategory as name
          slug: category.mainCategorySlug || "", // handle missing slug if any
        }));

        res.status(200).json({ categories: formattedCategories });
      } catch (error) {
        console.error("Error fetching main categories:", error);
        res.status(500).json({ message: "Failed to fetch main categories" });
      }
    });

    // Endpoint to get categories with subcategories
    app.get("/api/categories", async (req, res) => {
      try {
        const categories = await database
          .collection("Category")
          .find()
          .toArray();
        // Ensure each category’s subcategories are in array format
        const formattedCategories = categories.map((category) => {
          const mainCategoryName = Object.keys(category).find(
            (key) => key !== "_id"
          );
          return {
            _id: category._id,
            name: mainCategoryName,
            subcategories: Array.isArray(category[mainCategoryName])
              ? category[mainCategoryName]
              : [],
          };
        });
        res.json({ categories: formattedCategories });
      } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: "Failed to fetch categories" });
      }
    });

    // 1. Fetch product by slug
    app.get("/api/product/:slug", async (req, res) => {
      const { slug } = req.params;
      try {
        const product = await productCollection.findOne({
          "parentcode.subproduct.slug": slug,
        });

        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        // Find the specific subproduct with the matching slug
        const subproduct = product.parentcode.subproduct.find(
          (sub) => sub.slug === slug
        );

        if (!subproduct) {
          return res.status(404).json({ message: "Subproduct not found" });
        }

        res.json({
          ...subproduct,
          category: product.category, // Add category for related products
          parentProductName: product._id,
        });
      } catch (error) {
        console.error("Error fetching product by slug:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Fetch related products by category (excluding the current product and ensuring status is "Website")
app.get("/api/category/products", async (req, res) => {
  const { category, limit = 4, excludeSku } = req.query;

  try {
    const pipeline = [
      {
        $match: {
          category,
          "parentcode.subproduct": {
            $elemMatch: { sku: { $ne: excludeSku }, status: "Website" }
          }
        }
      },
      {
        $project: {
          "parentcode.subproduct": {
            $filter: {
              input: "$parentcode.subproduct",
              as: "sub",
              cond: {
                $and: [
                  { $ne: ["$$sub.sku", excludeSku] },
                  { $eq: ["$$sub.status", "Website"] }
                ]
              }
            }
          }
        }
      },
      { $limit: parseInt(limit, 10) }
    ];

    const products = await productCollection.aggregate(pipeline).toArray();
    res.json({ products });
  } catch (error) {
    console.error("Error fetching related products:", error);
    res.status(500).json({ message: "Server error" });
  }
});

    // 3. Fetch products with pagination and filter by price range and category
    app.get("/api/products/filter", async (req, res) => {
      const {
        category,
        minPrice = 10,
        maxPrice = Infinity,
        page = 1,
        limit = 50,
      } = req.query;

      try {
        const pipeline = [
          {
            $match: {
              category,
              "parentcode.subproduct.selling_price": {
                $gte: parseInt(minPrice, 10),
                $lte: parseInt(maxPrice, 10),
              },
            },
          },
          { $skip: (page - 1) * limit },
          { $limit: parseInt(limit, 10) },
        ];

        const products = await productCollection.aggregate(pipeline).toArray();
        const totalPages = Math.ceil(products.length / limit);

        res.json({ products, totalPages });
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // // Fetch products with pagination and filters
    // app.get("/api/products/pagination", async (req, res) => {
    //   const { category, minPrice, maxPrice, page = 1, limit = 50 } = req.query;
    //   const filters = {};

    //   // Apply filters based on query parameters
    //   if (category) filters["category"] = category;
    //   if (minPrice || maxPrice) {
    //     filters["parentcode.subproduct.selling_price"] = {
    //       ...(minPrice ? { $gte: parseInt(minPrice) } : {}),
    //       ...(maxPrice ? { $lte: parseInt(maxPrice) } : {}),
    //     };
    //   }

    //   // Log filters and query parameters for debugging
    //   console.log("Query Parameters:", {
    //     category,
    //     minPrice,
    //     maxPrice,
    //     page,
    //     limit,
    //   });
    //   console.log("Filters Applied:", filters);

    //   try {
    //     const productCollection = client
    //       .db("Trendy_management")
    //       .collection("Product");

    //     // Log message before fetching products
    //     console.log("Fetching products with filters...");

    //     const products = await productCollection
    //       .find(filters)
    //       .skip((page - 1) * parseInt(limit))
    //       .limit(parseInt(limit))
    //       .toArray();

    //     const totalProducts = await productCollection.countDocuments(filters);
    //     const totalPages = Math.ceil(totalProducts / limit);

    //     // Log fetched products and pagination details
    //     console.log("Fetched Products:", products.length);
    //     console.log(
    //       "Total Products:",
    //       totalProducts,
    //       "Total Pages:",
    //       totalPages
    //     );

    //     res.json({ products, totalPages });
    //   } catch (error) {
    //     console.error("Error fetching products:", error);
    //     res.status(500).json({ message: "Failed to fetch products" });
    //   }
    // });

    // Fetch products with pagination and filters
    // Fetch products with pagination and filters
    app.get("/api/products/pagination", async (req, res) => {
      const { category, minPrice, maxPrice, page = 1, limit = 50 } = req.query;
      const filters = {};

      // Apply category filter to the nested structure within `parentcode.subproduct.category`
      if (category) {
        filters["parentcode.subproduct.category"] = category;
      }

      // Apply status filter to ensure only products with `status: "Website"`
      filters["parentcode.subproduct.status"] = "Website";

      // Apply price range filter and ensure selling_price is greater than 1
      filters["parentcode.subproduct.selling_price"] = {
        ...(minPrice ? { $gte: parseInt(minPrice) } : { $gt: 1 }),
        ...(maxPrice ? { $lte: parseInt(maxPrice) } : {}),
      };

      // Debugging logs
      console.log("Query Parameters:", {
        category,
        minPrice,
        maxPrice,
        page,
        limit,
      });
      console.log("Filters Applied:", filters);

      try {
        const productCollection = client
          .db("Trendy_management")
          .collection("Product");

        // Log message before fetching products
        console.log("Fetching products with filters...");

        // Fetch products with pagination and applied filters
        const products = await productCollection
          .find(filters)
          .skip((page - 1) * parseInt(limit))
          .limit(parseInt(limit))
          .toArray();

        const totalProducts = await productCollection.countDocuments(filters);
        const totalPages = Math.ceil(totalProducts / limit);

        // Logging fetched data for debugging
        console.log("Fetched Products Count:", products.length);
        console.log(
          "Total Products:",
          totalProducts,
          "Total Pages:",
          totalPages
        );

        // Send the fetched data
        res.json({ products, totalPages });
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ message: "Failed to fetch products" });
      }
    });

    // Function to check and update OrderManagement collection based on RedxPayment data
    const updateOrderManagementForRedx = async () => {
      try {
        // Fetch all entries from RedxPayment
        const redxPayments = await redxPaymentCollection.find().toArray();

        for (const payment of redxPayments) {
          const { invoice, codAmount, shippingCharge, status } = payment;

          // Find the matching order in OrderManagement by invoiceId and status: "Redx"
          // Exclude orders with consignmentStatus: "Parcel Due"
          const order = await ordersCollection.findOne({
            invoiceId: invoice,
            status: "Redx",
            consignmentStatus: { $ne: "Parcel Due" },
          });

          if (order) {
            let updateFields = {};

            if (status === "Returned") {
              if (order.logisticStatus === "Returned") {
                updateFields = { shippingCharge: shippingCharge };
              } else {
                updateFields = { consignmentStatus: "Parcel Due" };
              }
            } else if (status === "Completed") {
              updateFields = {
                logisticStatus: "Completed",
                codAmount: codAmount,
                shippingCharge: shippingCharge,
              };
            } else if (status === "Partial") {
              if (order.logisticStatus === "Partial") {
                updateFields = {
                  codAmount: codAmount,
                  shippingCharge: shippingCharge,
                };
              } else {
                updateFields = { consignmentStatus: "Parcel Due" };
              }
            }

            // Update the order in OrderManagement
            await ordersCollection.updateOne(
              { invoiceId: invoice },
              { $set: updateFields }
            );
            console.log(`Order ${invoice} updated successfully for Redx.`);
          } else {
            console.log(
              `Order ${invoice} not found in OrderManagement for Redx.`
            );
          }
        }
      } catch (error) {
        console.error("Error updating OrderManagement for Redx:", error);
      }
    };

    // Schedule the job to run every 4 hours
    cron.schedule("0 */4 * * *", () => {
      console.log(
        "Running scheduled task to update OrderManagement based on RedxPayment"
      );
      updateOrderManagementForRedx();
    });

    app.post("/api/upload-redx", upload.single("file"), async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      try {
        // Read the Excel file
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // Prepare data for MongoDB insertion
        const processedData = data.map((row) => ({
          orderId: row["Order ID"] || "",
          invoice: row.Invoice || "",
          codAmount: parseFloat(row["COD Amount"] || 0),
          shippingCharge: parseFloat(row["Shipping Charge"] || 0),
          status: row.Status || "",
        }));

        const database = client.db("Trendy_management");
        const redxPaymentCollection = database.collection("RedxPayment");

        // Insert data into RedxPayment collection
        const insertResult = await redxPaymentCollection.insertMany(
          processedData
        );

        res.status(200).json({
          message: "File uploaded and processed successfully!",
          insertedCount: insertResult.insertedCount,
        });
      } catch (error) {
        console.error("Error processing file:", error);
        res.status(500).json({
          message: "Failed to process the file",
          error: error.message,
        });
      }
    });

    // Function to check and update OrderManagement collection
    const updateOrderManagement = async () => {
      try {
        // Fetch all entries from SteadFastPayment
        const steadFastPayments = await steadFastPaymentCollection
          .find()
          .toArray();

        for (const payment of steadFastPayments) {
          const { invoice, codAmount, shippingCharge, status } = payment;

          // Find the matching order in OrderManagement by invoiceId and status: "Steadfast"
          // Exclude orders with consignmentStatus: "Parcel Due"
          const order = await ordersCollection.findOne({
            invoiceId: invoice,
            status: "Steadfast",
            consignmentStatus: { $ne: "Parcel Due" },
          });

          if (order) {
            let updateFields = {};

            if (status === "Returned") {
              if (order.logisticStatus === "Returned") {
                updateFields = { shippingCharge: shippingCharge };
              } else {
                updateFields = { consignmentStatus: "Parcel Due" };
              }
            } else if (status === "Completed") {
              updateFields = {
                logisticStatus: "Completed",
                codAmount: codAmount,
                shippingCharge: shippingCharge,
              };
            } else if (status === "Partial") {
              if (order.logisticStatus === "Partial") {
                updateFields = {
                  codAmount: codAmount,
                  shippingCharge: shippingCharge,
                };
              } else {
                updateFields = { consignmentStatus: "Parcel Due" };
              }
            }

            // Update the order in OrderManagement
            await ordersCollection.updateOne(
              { invoiceId: invoice },
              { $set: updateFields }
            );
            console.log(`Order ${invoice} updated successfully.`);
          } else {
            console.log(`Order ${invoice} not found in OrderManagement.`);
          }
        }
      } catch (error) {
        console.error("Error updating OrderManagement:", error);
      }
    };

    // Schedule the job to run every 4 hours
    cron.schedule("0 */4 * * *", () => {
      console.log(
        "Running scheduled task to update OrderManagement based on SteadFastPayment"
      );
      updateOrderManagement();
    });

    // Endpoint to upload and process Excel file
    app.post(
      "/api/upload-steadfast",
      upload.single("file"),
      async (req, res) => {
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        try {
          // Read and parse the uploaded Excel file
          const workbook = XLSX.readFile(req.file.path);
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet);

          // Structure data according to MongoDB collection
          const processedData = data.map((row) => ({
            consignmentId: row.ConsignmentId || "",
            trackingCode: row["Tracking Code"] || "",
            invoice: row.Invoice || "",
            codAmount: row["COD Amount"] || 0,
            shippingCharge: row["Shipping Charge"] || 0,
            status: row.Status || "",
          }));

          // Insert data into the SteadFastPayment collection
          const insertResult = await steadFastPaymentCollection.insertMany(
            processedData
          );

          // Send success response
          res.status(200).json({
            message: "File uploaded and processed successfully!",
            insertedCount: insertResult.insertedCount,
          });
        } catch (error) {
          console.error("Error processing file:", error);
          res.status(500).json({
            message: "Failed to process the file",
            error: error.message,
          });
        }
      }
    );

    // Bulk update order status to "Stock Out" by invoiceId
    app.post("/api/orders/bulk-update-status", async (req, res) => {
      const { invoiceIds, status } = req.body;

      // Log the incoming request
      console.log(
        "Bulk update request for status:",
        status,
        "Invoice IDs:",
        invoiceIds
      );

      if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid Invoice IDs" });
      }

      try {
        const result = await ordersCollection.updateMany(
          { invoiceId: { $in: invoiceIds } }, // Find orders with matching invoiceIds
          { $set: { status } } // Set the status to "Stock Out"
        );

        // Log the update result
        console.log("MongoDB update result:", result);

        if (result.modifiedCount > 0) {
          res.json({ success: true, message: "Orders updated successfully." });
        } else {
          res
            .status(400)
            .json({ success: false, message: "No matching orders found." });
        }
      } catch (error) {
        console.error("Error updating orders:", error);
        res.status(500).json({ success: false, message: "Server error." });
      }
    });

    // Update order status to 'Tomorrow' based on invoiceId
    app.post("/api/orders/update-status-tomorrow", async (req, res) => {
      const { invoiceIds } = req.body;

      try {
        const result = await ordersCollection.updateMany(
          { invoiceId: { $in: invoiceIds } },
          { $set: { status: "Tomorrow" } }
        );

        if (result.modifiedCount > 0) {
          res.json({ success: true, message: "Orders updated successfully." });
        } else {
          res
            .status(404)
            .json({ success: false, message: "No matching orders found." });
        }
      } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ success: false, message: "Server error." });
      }
    });

    // Check product quantity by SKU
    app.get("/api/products/check-quantity", async (req, res) => {
      const { sku } = req.query; // Get SKU from the query parameters

      try {
        // Find the product by SKU
        const product = await productCollection.findOne({
          "parentcode.subproduct.sku": sku,
        });

        if (!product) {
          return res
            .status(404)
            .json({ success: false, message: "Product not found." });
        }

        // Find the specific subproduct with the matching SKU
        const subproduct = product.parentcode.subproduct.find(
          (sub) => sub.sku === sku
        );

        if (!subproduct) {
          return res
            .status(404)
            .json({ success: false, message: "Subproduct not found." });
        }

        // Return the quantity of the selected product
        res.json({ success: true, quantity: subproduct.quantity });
      } catch (error) {
        console.error("Error checking product quantity:", error);
        res.status(500).json({ success: false, message: "Server error." });
      }
    });

    // Update product quantity in the Product collection
    app.put("/api/products/update-quantity", async (req, res) => {
      const { sku, qty } = req.body; // Extract the sku and quantity from the request

      // Log the request body
      console.log("Request to update product quantity:", req.body);

      try {
        // Convert the qty to an integer
        const quantityToDecrease = parseInt(qty, 10); // Convert the qty to a number

        if (isNaN(quantityToDecrease)) {
          console.error("Invalid quantity provided:", qty);
          return res
            .status(400)
            .json({ success: false, message: "Invalid quantity provided" });
        }

        // Find the product by SKU and retrieve the current quantity
        const product = await productCollection.findOne({
          "parentcode.subproduct.sku": sku,
        });

        if (!product) {
          console.error("Product not found for SKU:", sku);
          return res
            .status(404)
            .json({ success: false, message: "Product not found." });
        }

        // Find the specific subproduct with the matching SKU
        const subproduct = product.parentcode.subproduct.find(
          (sub) => sub.sku === sku
        );

        if (!subproduct || isNaN(parseInt(subproduct.quantity))) {
          console.error(
            "Quantity is not a valid number or subproduct not found:",
            subproduct
          );
          return res.status(400).json({
            success: false,
            message: "Invalid quantity type or subproduct not found.",
          });
        }

        const currentQuantity = parseInt(subproduct.quantity, 10); // Convert quantity to number

        // Log the current quantity before updating
        console.log(`Current quantity for SKU ${sku}:`, currentQuantity);

        const newQuantity = currentQuantity - quantityToDecrease;

        // Update the quantity in the database
        const result = await productCollection.updateOne(
          { _id: product._id, "parentcode.subproduct.sku": sku },
          {
            $set: {
              "parentcode.subproduct.$.quantity": newQuantity.toString(),
            },
          } // Convert back to string for storage
        );

        // Log the result from the update operation
        console.log("MongoDB update result:", result);

        if (result.modifiedCount > 0) {
          res.json({
            success: true,
            message: "Product quantity updated successfully.",
          });
        } else {
          console.error("Failed to update product quantity:", result);
          res.status(400).json({
            success: false,
            message: "Failed to update product quantity.",
          });
        }
      } catch (error) {
        console.error("Error updating product quantity:", error);
        res.status(500).json({ success: false, message: "Server error." });
      }
    });

    app.post("/api/orders/consignment-upload", async (req, res) => {
      const { orders } = req.body;

      if (!orders || !Array.isArray(orders)) {
        return res
          .status(400)
          .json({ message: "Invalid data format. Orders should be an array." });
      }

      try {
        for (let order of orders) {
          const invoiceId = order.invoiceId;

          // Check if the order with the same invoiceId already exists
          const existingOrder = await ordersCollection.findOne({ invoiceId });

          if (existingOrder) {
            // Merge products if the order already exists
            for (let product of order.products) {
              const existingProductIndex = existingOrder.products.findIndex(
                (p) => p.sku === product.sku
              );
              if (existingProductIndex !== -1) {
                // If the product exists, update its quantity and total
                existingOrder.products[existingProductIndex].qty += parseInt(
                  product.qty
                );
                existingOrder.products[existingProductIndex].total +=
                  parseFloat(product.total);
              } else {
                // If the product doesn't exist, add it to the products array
                existingOrder.products.push({
                  parentSku: product.parentSku,
                  sku: product.sku,
                  selling_price: parseFloat(product.selling_price),
                  qty: parseInt(product.qty),
                  total: parseFloat(product.total),
                  skus: product.skus.map((subSku) => ({
                    sku: subSku.sku,
                    name: subSku.name,
                    buying_price: parseFloat(subSku.buying_price),
                    selling_price: parseFloat(subSku.selling_price),
                    qty: parseInt(subSku.qty),
                  })),
                });
              }
            }
            // Update existing order's total amounts and consignment details
            existingOrder.deliveryCost =
              parseFloat(order.deliveryCost) || existingOrder.deliveryCost;
            existingOrder.advance =
              parseFloat(order.advance) || existingOrder.advance;
            existingOrder.discount =
              parseFloat(order.discount) || existingOrder.discount;
            existingOrder.grandTotal = existingOrder.products.reduce(
              (sum, product) => sum + product.total,
              0
            );
            existingOrder.consignmentId =
              order.consignmentId || existingOrder.consignmentId;
            existingOrder.status = order.status || existingOrder.status;

            // Update the order in the database
            await ordersCollection.updateOne(
              { invoiceId },
              { $set: existingOrder }
            );
          } else {
            // If the order doesn't exist, create a new order
            const newOrder = {
              invoiceId: order.invoiceId || "",
              date: new Date(order.date) || null,
              pageName: order.pageName || "",
              customerName: order.customerName || "",
              phoneNumber: order.phoneNumber || "",
              address: order.address || "",
              note: order.note || "",
              products: order.products.map((product) => ({
                parentSku: product.parentSku,
                sku: product.sku,
                selling_price: parseFloat(product.selling_price),
                qty: parseInt(product.qty),
                total: parseFloat(product.total),
                skus: product.skus.map((subSku) => ({
                  sku: subSku.sku,
                  name: subSku.name,
                  buying_price: parseFloat(subSku.buying_price),
                  selling_price: parseFloat(subSku.selling_price),
                  qty: parseInt(subSku.qty),
                })),
              })),
              deliveryCost: parseFloat(order.deliveryCost) || 0,
              advance: parseFloat(order.advance) || 0,
              discount: parseFloat(order.discount) || 0,
              grandTotal: parseFloat(order.grandTotal) || 0,
              consignmentId: order.consignmentId || "",
              status: order.status || "Pending",
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Insert the new order into the database
            await ordersCollection.insertOne(newOrder);
          }
        }

        res.status(200).json({
          message:
            "Orders uploaded and merged successfully with consignment details.",
        });
      } catch (error) {
        console.error(
          "Error uploading and merging orders with consignment:",
          error
        );
        res.status(500).json({
          message: "Error uploading and merging orders with consignment.",
          error,
        });
      }
    });

    // Bulk upload orders endpoint with merging logic
    app.post("/api/orders/bulk-upload", async (req, res) => {
      const { orders } = req.body;

      if (!orders || !Array.isArray(orders)) {
        return res
          .status(400)
          .json({ message: "Invalid data format. Orders should be an array." });
      }

      try {
        for (let order of orders) {
          const invoiceId = order.invoiceId;

          // Check if the order with the same invoiceId already exists
          const existingOrder = await ordersCollection.findOne({ invoiceId });

          if (existingOrder) {
            // Merge products if the order already exists
            for (let product of order.products) {
              const existingProductIndex = existingOrder.products.findIndex(
                (p) => p.sku === product.sku
              );
              if (existingProductIndex !== -1) {
                // If the product exists, update its quantity and total
                existingOrder.products[existingProductIndex].qty += parseInt(
                  product.qty
                );
                existingOrder.products[existingProductIndex].total +=
                  parseFloat(product.total);
              } else {
                // If the product doesn't exist, add it to the products array
                existingOrder.products.push({
                  parentSku: product.parentSku,
                  sku: product.sku,
                  selling_price: parseFloat(product.selling_price),
                  qty: parseInt(product.qty),
                  total: parseFloat(product.total),
                  skus: product.skus.map((subSku) => ({
                    sku: subSku.sku,
                    name: subSku.name,
                    buying_price: parseFloat(subSku.buying_price),
                    selling_price: parseFloat(subSku.selling_price),
                    qty: parseInt(subSku.qty),
                  })),
                });
              }
            }

            // Update the existing order's total amounts and delivery information
            existingOrder.deliveryCost =
              parseFloat(order.deliveryCost) || existingOrder.deliveryCost;
            existingOrder.advance =
              parseFloat(order.advance) || existingOrder.advance;
            existingOrder.discount =
              parseFloat(order.discount) || existingOrder.discount;
            existingOrder.grandTotal = existingOrder.products.reduce(
              (sum, product) => sum + product.total,
              0
            );

            // Update the order in the database
            await ordersCollection.updateOne(
              { invoiceId },
              { $set: existingOrder }
            );
          } else {
            // If the order doesn't exist, create a new order
            const newOrder = {
              invoiceId: order.invoiceId || "",
              date: new Date(order.date) || null,
              pageName: order.pageName || "",
              customerName: order.customerName || "",
              phoneNumber: order.phoneNumber || "",
              address: order.address || "",
              note: order.note || "",
              products: order.products.map((product) => ({
                parentSku: product.parentSku,
                sku: product.sku,
                selling_price: parseFloat(product.selling_price),
                qty: parseInt(product.qty),
                total: parseFloat(product.total),
                skus: product.skus.map((subSku) => ({
                  sku: subSku.sku,
                  name: subSku.name,
                  buying_price: parseFloat(subSku.buying_price),
                  selling_price: parseFloat(subSku.selling_price),
                  qty: parseInt(subSku.qty),
                })),
              })),
              deliveryCost: parseFloat(order.deliveryCost) || 0,
              advance: parseFloat(order.advance) || 0,
              discount: parseFloat(order.discount) || 0,
              grandTotal: parseFloat(order.grandTotal) || 0,
              status: order.status || "Pending",
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Insert the new order into the database
            await ordersCollection.insertOne(newOrder);
          }
        }

        res
          .status(200)
          .json({ message: "Orders uploaded and merged successfully." });
      } catch (error) {
        console.error("Error uploading and merging orders:", error);
        res
          .status(500)
          .json({ message: "Error uploading and merging orders.", error });
      }
    });

    app.get("/api/orders/stock-out", async (req, res) => {
      try {
        // Fetch orders with status 'Stock Out'
        // console.log('Fetching orders with status "Stock Out"...');
        const stockOutOrders = await ordersCollection
          .find({ status: "Stock Out" })
          .toArray();

        // Log the fetched orders
        // console.log('Fetched Stock Out orders:', stockOutOrders);

        // Group orders by parentSku and calculate order count and total quantity for each
        const groupedData = stockOutOrders.reduce((acc, order) => {
          // console.log('Processing order:', order);

          // Ensure 'products' field exists and is an array
          if (order.products && Array.isArray(order.products)) {
            order.products.forEach((product) => {
              const { parentSku, qty } = product;
              // console.log('Processing product:', product);

              if (!parentSku) {
                console.error("Product missing parentSku:", product);
                return;
              }

              // Parse 'qty' as a number from a string
              const quantity = parseFloat(qty) || 0;

              if (!acc[parentSku]) {
                acc[parentSku] = {
                  parentSku,
                  orderQuantity: 0,
                  totalQuantity: 0,
                };
                //  console.log(`Initializing new parentSku in accumulator: ${parentSku}`);
              }

              // Increment order count and total product quantity
              acc[parentSku].orderQuantity += 1;
              acc[parentSku].totalQuantity += quantity;

              // console.log(`Updated ${parentSku} - orderQuantity: ${acc[parentSku].orderQuantity}, totalQuantity: ${acc[parentSku].totalQuantity}`);
            });
          } else {
            console.warn(
              `Order ${
                order.invoiceId || "Unknown ID"
              } has no valid products array.`
            );
          }

          return acc;
        }, {});

        // Convert the grouped data into an array
        const result = Object.values(groupedData);

        // Log the final result
        // console.log('Grouped data result:', result);

        // Send the result back to the frontend
        res.status(200).json(result);
      } catch (error) {
        console.error("Error fetching Stock Out orders:", error);
        res.status(500).json({ message: "Failed to retrieve Stock Out data" });
      }
    });

    // Route to fetch Call Center Summary report with updatedAt filtering
    app.post("/api/reports/call-center-summary", async (req, res) => {
      const { startDate, endDate } = req.body;

      // Log the incoming request body
      console.log("Received request with date range:", { startDate, endDate });

      // Convert dates to proper JavaScript Date objects
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59); // Include entire end date

      console.log("Formatted start date:", start, "Formatted end date:", end);

      try {
        const users = await usersCollection.find({}).toArray();

        // Log the number of users found
        console.log("Number of users found:", users.length);

        const results = [];

        for (const user of users) {
          const userId = user.uid;
          const userName = user.userName;

          console.log(`Fetching orders for user: ${userName} (ID: ${userId})`);

          // Count orders assigned to the user, filtered by `updatedAt`
          const totalAssigned = await ordersCollection.countDocuments({
            assignedTo: userId,
            updatedAt: { $gte: start, $lte: end },
          });

          console.log(`Total assigned orders for ${userName}:`, totalAssigned);

          if (totalAssigned === 0) {
            console.log(
              `Skipping user ${userName} because they have no assigned orders.`
            );
            continue; // Skip users with 0 assigned orders
          }

          // Fetch other statuses using `updatedAt`
          const totalPending = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "Pending",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(`Total Pending orders for ${userName}:`, totalPending);

          const totalCancelled = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "Cancel",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(
            `Total Cancelled orders for ${userName}:`,
            totalCancelled
          );

          const totalNoAnswer = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "No Answer",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(`Total No Answer orders for ${userName}:`, totalNoAnswer);

          const totalOkPending = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "Ok Pending",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(
            `Total Ok Pending orders for ${userName}:`,
            totalOkPending
          );

          const totalTomorrow = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "Tomorrow",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(`Total Tomorrow orders for ${userName}:`, totalTomorrow);

          const totalStore = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "Store",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(`Total Store orders for ${userName}:`, totalStore);
          //-------------------------------------------------------------------------
          const totalRedx = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "Redx",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(`Total Redx orders for ${userName}:`, totalRedx);

          const totalSteadfast = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "Steadfast",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(
            `Total Steadfast orders for ${userName}:`,
            totalSteadfast
          );

          const totalPathaow = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "Pathaow",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(`Total Pathaow orders for ${userName}:`, totalPathaow);

          // Fetch Schedule Memo and Stock Out counts
          const totalScheduleMemo = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "Schedule Memo",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(
            `Total Schedule Memo orders for ${userName}:`,
            totalScheduleMemo
          );

          const totalStockOut = await ordersCollection.countDocuments({
            assignedTo: userId,
            status: "Stock Out",
            updatedAt: { $gte: start, $lte: end },
          });
          console.log(`Total Stock Out orders for ${userName}:`, totalStockOut);

          const userData = {
            userName,
            totalAssigned,
            totalPending,
            totalCancelled,
            totalNoAnswer,
            totalRedx,
            totalSteadfast,
            totalPathaow,
            totalScheduleMemo,
            totalOkPending,
            totalStockOut,
            totalStore,
            totalTomorrow,
          };

          // Log the collected data for the user
          console.log(`Collected data for ${userName}:`, userData);

          results.push(userData);
        }

        // Log the final results before sending the response
        console.log("Final results:", results);

        res.status(200).json(results);
      } catch (error) {
        console.error("Error fetching call center summary:", error);
        res.status(500).json({ error: "Error fetching call center summary" });
      }
    });

    // Route to fetch report data based on date range and various statuses
    app.post("/api/reports/date-wise", async (req, res) => {
      const { startDate, endDate } = req.body;

      try {
        // Ensure proper date parsing and include the entire end date
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Logging start and end dates for debugging purposes
        console.log(`Fetching report data for range: ${start} to ${end}`);

        // Define the base query for all documents within the date range
        const dateRangeQuery = { createdAt: { $gte: start, $lte: end } };

        // Define the queries for different statuses and logistic statuses
        const statusQueries = {
          totalRedxOrders: { ...dateRangeQuery, status: "Redx" },
          totalSteadfastOrders: { ...dateRangeQuery, status: "Steadfast" },
          totalPathaowOrders: { ...dateRangeQuery, status: "Pathaow" },
          totalPending: { ...dateRangeQuery, status: "Pending" },
          totalStoreOrders: { ...dateRangeQuery, status: "Store" },
          totalCancelledMemo: { ...dateRangeQuery, status: "Cancel" },
          totalNoAnswerOrders: { ...dateRangeQuery, status: "No Answer" },
          totalScheduleOrders: { ...dateRangeQuery, status: "Schedule Memo" },
          totalStockOutOrders: { ...dateRangeQuery, status: "Stock Out" },
          totalOkPendingOrders: { ...dateRangeQuery, status: "Ok Pending" },
          totalTomorrowOrders: { ...dateRangeQuery, status: "Tomorrow" },
          totalPrintedMemo: { ...dateRangeQuery, markAsPrinted: "True" },
          totalReturned: { ...dateRangeQuery, logisticStatus: "Returned" },
          totalDamaged: { ...dateRangeQuery, logisticStatus: "Damage" },
          totalPartial: { ...dateRangeQuery, logisticStatus: "Partial" },
        };

        // Fetch all the counts in parallel using Promise.all for efficiency
        const [
          totalOrders,
          totalRedxOrders,
          totalSteadfastOrders,
          totalPathaowOrders,
          totalPending,
          totalStoreOrders,
          totalCancelledMemo,
          totalNoAnswerOrders,
          totalScheduleOrders,
          totalStockOutOrders,
          totalTomorrowOrders,
          totalPrintedMemo,
          totalReturned,
          totalDamaged,
          totalPartial,
        ] = await Promise.all([
          ordersCollection.countDocuments(dateRangeQuery),
          ordersCollection.countDocuments(statusQueries.totalRedxOrders),
          ordersCollection.countDocuments(statusQueries.totalSteadfastOrders),
          ordersCollection.countDocuments(statusQueries.totalPathaowOrders),
          ordersCollection.countDocuments(statusQueries.totalPending),
          ordersCollection.countDocuments(statusQueries.totalStoreOrders),
          ordersCollection.countDocuments(statusQueries.totalScheduleOrders),
          ordersCollection.countDocuments(statusQueries.totalStockOutOrders),
          ordersCollection.countDocuments(statusQueries.totalTomorrowOrders),
          ordersCollection.countDocuments(statusQueries.totalCancelledMemo),
          ordersCollection.countDocuments(statusQueries.totalNoAnswerOrders),
          ordersCollection.countDocuments(statusQueries.totalPrintedMemo),
          ordersCollection.countDocuments(statusQueries.totalReturned),
          ordersCollection.countDocuments(statusQueries.totalDamaged),
          ordersCollection.countDocuments(statusQueries.totalPartial),
        ]);

        // Send the report data as a JSON response
        res.status(200).json({
          totalOrders,
          totalRedxOrders,
          totalSteadfastOrders,
          totalPathaowOrders,
          totalPending,
          totalStoreOrders,
          totalScheduleOrders,
          totalStockOutOrders,
          totalTomorrowOrders,
          totalCancelledMemo,
          totalNoAnswerOrders,
          totalPrintedMemo,
          totalReturned,
          totalDamaged,
          totalPartial,
        });
      } catch (error) {
        console.error("Error fetching report data:", error);
        res.status(500).json({ error: "Error fetching report data" });
      }
    });

    //Code to Fetch Redx Status

    app.get("/api/orders/redx-status/:trackingId", async (req, res) => {
      const { trackingId } = req.params;

      // Check if tracking ID is provided
      if (!trackingId) {
        return res.status(400).json({ message: "Tracking ID is required" });
      }

      //console.log(`Fetching Redx status for tracking ID: ${trackingId}`);

      const myHeaders = new Headers();
      myHeaders.append(
        "API-ACCESS-TOKEN",
        `Bearer ${process.env.REDX_API_TOKEN}`
      );

      const requestOptions = {
        method: "GET",
        headers: myHeaders,
        redirect: "follow",
      };

      try {
        const response = await fetch(
          `https://openapi.redx.com.bd/v1.0.0-beta/parcel/info/${trackingId}`,
          requestOptions
        );
        const result = await response.json();
        //console.log(`Redx API Response: `, result);

        if (response.ok) {
          const status = result.parcel?.status || "Status not found";
          return res.status(200).json({ status });
        } else {
          console.error("Failed to fetch status from Redx", result);
          return res.status(400).json({
            message: "Failed to fetch status from Redx",
            error: result,
          });
        }
      } catch (error) {
        console.error("Error fetching from Redx:", error);
        return res
          .status(500)
          .json({ message: "Internal server error", error });
      }
    });

    // redx order sent
    app.post("/api/orders/send-to-redx", async (req, res) => {
      const {
        orderId,
        customerName,
        phoneNumber,
        address,
        grandTotal,
        redxArea,
        redxAreaId,
      } = req.body;

      // Log the received request body
      //console.log("Received request body:", req.body);

      if (!orderId) {
        // console.log("Missing orderId");
        return res.status(400).json({ message: "Invoice ID is required" });
      }

      const myHeaders = new Headers();
      myHeaders.append(
        "API-ACCESS-TOKEN",
        `Bearer ${process.env.REDX_API_TOKEN}`
      );
      myHeaders.append("Content-Type", "application/json");

      // Log the raw data to be sent to Redx API
      const raw = JSON.stringify({
        customer_name: customerName,
        customer_phone: phoneNumber,
        delivery_area: redxArea,
        delivery_area_id: redxAreaId,
        customer_address: address,
        merchant_invoice_id: orderId,
        cash_collection_amount: grandTotal,
        parcel_weight: 500,
        value: grandTotal,
      });

      // console.log("Raw payload for Redx API:", raw);

      const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow",
      };

      try {
        // Log the request before sending
        // console.log("Sending request to Redx API...");

        const response = await fetch(
          "https://openapi.redx.com.bd/v1.0.0-beta/parcel",
          requestOptions
        );
        const result = await response.json();

        // Log the result from Redx API
        // console.log("Response from Redx API:", result);

        if (response.ok) {
          const consignmentId = result.tracking_id;

          // Log the consignmentId
          //  console.log("Received consignmentId from Redx API:", consignmentId);

          if (!consignmentId) {
            return res.status(400).json({
              success: false,
              message: "Failed to get consignmentId from Redx.",
            });
          }

          // Update the order with consignmentId in your MongoDB
          // console.log("Updating MongoDB with consignmentId...");
          await ordersCollection.updateOne(
            { invoiceId: orderId },
            {
              $set: {
                consignmentId,
                logisticStatus: "Redx",
                updatedAt: new Date(),
              },
            }
          );

          // Log success message
          //  console.log("Order updated successfully in MongoDB");

          // Send success response
          return res.status(200).json({
            success: true,
            message: "Order sent to Redx successfully",
            consignmentId,
          });
        } else {
          // Log the error from Redx API
          // console.error("Error from Redx API:", result);
          return res.status(400).json({
            success: false,
            message: "Failed to send order to Redx",
            error: result,
          });
        }
      } catch (error) {
        // Log any internal error
        // console.error('Error sending to Redx:', error);
        return res
          .status(500)
          .json({ success: false, message: "Internal server error", error });
      }
    });

    // Fetch Redx Areas based on district
    app.get("/api/redx/areas", async (req, res) => {
      let { districtName } = req.query;

      if (!districtName) {
        return res.status(400).json({ message: "District name is required" });
      }

      districtName = districtName.toLowerCase(); // Convert to lowercase

      const apiToken = process.env.REDX_API_TOKEN; // Ensure this token is valid

      var myHeaders = new Headers();
      myHeaders.append("API-ACCESS-TOKEN", `Bearer ${apiToken}`);

      var requestOptions = {
        method: "GET",
        headers: myHeaders,
        redirect: "follow",
      };

      try {
        const response = await fetch(
          `https://openapi.redx.com.bd/v1.0.0-beta/areas?district_name=${encodeURIComponent(
            districtName
          )}`,
          requestOptions
        );
        const contentType = response.headers.get("content-type");

        // Check if the response is JSON
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          const areaNames = data.areas;
          res.status(200).json({ areas: areaNames });
        } else {
          // If it's not JSON, return an error
          const errorText = await response.text();
          console.error("Error fetching areas:", errorText); // Log the HTML response for debugging
          res
            .status(500)
            .json({ message: "Failed to fetch areas", error: errorText });
        }
      } catch (error) {
        console.error("Error fetching areas from Redx:", error);
        res
          .status(500)
          .json({ message: "Error fetching areas from Redx", error });
      }
    });

    // Helper function to convert MongoDB `updatedAt` to JavaScript `Date`
    const parseMongoDate = (mongoDate) => {
      if (mongoDate && mongoDate.$date) {
        return new Date(mongoDate.$date);
      }
      return null;
    };

    // Route to mark selected orders as printed
    app.post("/api/orders/mark-printed", async (req, res) => {
      const { orderIds } = req.body;
      try {
        const objectIds = orderIds.map((id) => new ObjectId(id));
        const result = await ordersCollection.updateMany(
          { _id: { $in: objectIds } },
          { $set: { markAsPrinted: "True" } }
        );
        if (result.modifiedCount > 0) {
          res.status(200).send("Orders marked as printed");
        } else {
          res.status(404).send("No orders found to mark as printed");
        }
      } catch (error) {
        res.status(500).send("Error marking orders as printed");
      }
    });

    // API to find an order by invoiceId and status 'Pathaow'
    app.post("/api/orders/find-pathaow", async (req, res) => {
      const { invoiceId, status } = req.body;

      try {
        // Find the order by invoiceId and status 'Pathaow'
        const order = await ordersCollection.findOne({ invoiceId, status });

        if (!order) {
          return res.status(404).json({
            message:
              "Order not found with Pathaow status and the given Invoice ID.",
          });
        }

        res.status(200).json(order);
      } catch (error) {
        console.error("Error fetching order:", error);
        res.status(500).json({ message: "Error fetching order." });
      }
    });

    // API to update the logistic status of an order
    app.patch("/api/orders/update-status/:id", async (req, res) => {
      const { id } = req.params;
      const { logisticStatus, returnedProduct } = req.body;

      try {
        // Update the logisticStatus and returnedProduct (if applicable)
        const updateFields = {
          logisticStatus,
        };

        if (logisticStatus === "Partial" && returnedProduct) {
          updateFields.returnedProduct = returnedProduct; // Only add returned products for Partial returns
        }

        const updateResult = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(404).json({
            message: "Order not found or logistic status not updated.",
          });
        }

        res
          .status(200)
          .json({ message: "Logistic status updated successfully." });
        updateOrderManagement();
        updateOrderManagementForRedx();
      } catch (error) {
        console.error("Error updating logistic status:", error);
        res.status(500).json({ message: "Error updating logistic status." });
      }
    });

    // Find order by status and either consignmentId or invoiceId
    // Find order by status and either consignmentId or invoiceId
    app.post("/api/orders/find", async (req, res) => {
      const { consignmentId, invoiceId, status } = req.body;

      // Log the received data to verify what's being passed
      console.log("API called with status:", status);
      console.log(
        "Received Consignment ID:",
        consignmentId,
        "Received Invoice ID:",
        invoiceId
      );

      try {
        const query = {
          status, // Always include status in the query
        };

        // If invoiceId is present, search by invoiceId, otherwise by consignmentId
        if (invoiceId) {
          query.invoiceId = String(invoiceId); // Ensure invoiceId is treated as a string
          console.log("Searching with Invoice ID:", invoiceId);
        } else if (consignmentId) {
          query.consignmentId = Number(consignmentId); // Ensure consignmentId is treated as a number
          console.log("Searching with Consignment ID:", consignmentId);
        } else {
          console.error("No ID provided for search.");
          return res
            .status(400)
            .json({ message: "No valid ID provided for the search." });
        }

        // Perform the query
        const order = await ordersCollection.findOne(query);
        console.log("Order found:", order); // Log the found order

        if (!order) {
          console.log("No order found.");
          return res.status(404).json({
            message: "Order not found with the given ID and status.",
          });
        }

        res.status(200).json(order);
      } catch (error) {
        console.error("Failed to retrieve order:", error);
        res.status(500).json({ message: "Failed to retrieve order", error });
      }
    });

    // API to find Redx order by consignmentId (string)
    app.post("/api/orders/find-redx", async (req, res) => {
      const { consignmentId, invoiceId, status } = req.body;
      // console.log('Redx Consignment ID:', consignmentId);

      // Log the received data to verify what's being passed
      console.log("API called with status:", status);
      console.log(
        "Received Consignment ID:",
        consignmentId,
        "Received Invoice ID:",
        invoiceId
      );

      try {
        const query = {
          status, // Always include status in the query
        };

        // If invoiceId is present, search by invoiceId, otherwise by consignmentId
        if (invoiceId) {
          query.invoiceId = invoiceId; // Ensure invoiceId is treated as a string
          console.log("Searching with Invoice ID:", invoiceId);
        } else if (consignmentId) {
          query.consignmentId = String(consignmentId); // Ensure consignmentId is treated as a number
          console.log("Searching with Consignment ID:", consignmentId);
        } else {
          console.error("No ID provided for search.");
          return res
            .status(400)
            .json({ message: "No valid ID provided for the search." });
        }

        // Perform the query
        const order = await ordersCollection.findOne(query);
        console.log("Order found:", order); // Log the found order

        if (!order) {
          console.log("No order found.");
          return res.status(404).json({
            message: "Order not found with the given ID and status.",
          });
        }

        res.status(200).json(order);
      } catch (error) {
        console.error("Failed to retrieve order:", error);
        res.status(500).json({ message: "Failed to retrieve order", error });
      }
    });

    // Endpoint to update the order logisticStatus by consignmentId and _id
    app.patch("/api/orders/update-status/:id", async (req, res) => {
      const { id } = req.params;
      const { logisticStatus, returnedProduct } = req.body;

      try {
        // Find the order by _id
        const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

        if (!order) {
          return res
            .status(404)
            .json({ message: "Order not found with the given ID" });
        }

        // Update the logisticStatus and patch the returnedProduct array
        const updateFields = {
          logisticStatus,
          updatedAt: new Date(),
        };

        // If returnedProduct is provided, add it to the order
        if (returnedProduct && Array.isArray(returnedProduct)) {
          updateFields.returnedProduct = returnedProduct;
        }

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        if (result.modifiedCount > 0) {
          updateOrderManagement();
          return res.status(200).json({
            message: `Order logisticStatus updated to "${logisticStatus}" successfully!`,
          });
        } else {
          return res
            .status(500)
            .json({ message: "Failed to update order logisticStatus" });
        }
      } catch (error) {
        return res
          .status(500)
          .json({ message: "Error updating the order", error });
      }
    });

    // API to mark orders as exported
    app.post("/api/orders/mark-exported", async (req, res) => {
      try {
        const { orderIds } = req.body;

        if (!orderIds || !Array.isArray(orderIds)) {
          return res.status(400).json({ message: "orderIds must be an array" });
        }

        // Convert orderIds to ObjectId
        const objectIds = orderIds.map((id) => new ObjectId(id));

        // Update orders to mark as exported
        const result = await ordersCollection.updateMany(
          { _id: { $in: objectIds } },
          { $set: { markAs: "Exported", updatedAt: new Date() } }
        );

        if (result.modifiedCount > 0) {
          res
            .status(200)
            .json({ message: "Orders marked as Exported successfully." });
        } else {
          res.status(404).json({ message: "No orders found to update." });
        }
      } catch (error) {
        console.error("Error marking orders as exported:", error);
        res.status(500).json({ error: "Failed to mark orders as Exported" });
      }
    });

    /**
     * Get Orders Assigned to User
     */
    app.get("/api/orders/assigned/:userId", async (req, res) => {
      const { userId } = req.params;
      try {
        const orders = await ordersCollection
          .find({ assignedTo: userId })
          .sort({ date: -1 })
          .toArray();
        res.status(200).json(orders);
      } catch (error) {
        res.status(500).json({ message: "Error fetching orders", error });
      }
    });

    /**
     * Update Order Status
     */
    app.put("/api/orders/:id", async (req, res) => {
      const { id } = req.params;

      // Log incoming request body
      // console.log("Received request for updating order:", req.body);

      const {
        consignmentId,
        status,
        redxDistrict,
        note,
        redxArea,
        comment,
        customerName,
        phoneNumber,
        address,
        deliveryCost,
        advance,
        discount,
        scheduleDate,
      } = req.body;

      // Prepare the update data object and log the initial data
      const updateData = {
        status,
        customerName,
        phoneNumber,
        address,
        note,
        consignmentId, // Save the consignmentId
        deliveryCost: parseFloat(deliveryCost),
        advance: parseFloat(advance),
        discount: parseFloat(discount),
        products: req.body.products.map((product) => ({
          ...product,
          total: parseFloat(product.total),
        })),
        grandTotal: parseFloat(req.body.grandTotal),
        updatedAt: new Date(),
        district: redxDistrict,
        area: redxArea,
      };

      // Log the initial updateData
      // console.log("Initial update data:", updateData);

      // Add specific logic for different statuses
      if (status === "Redx" || status === "Pathaow") {
        updateData.district = redxDistrict;
        updateData.area = redxArea;
        console.log("Redx/Pathaow selected - District and Area updated:", {
          district: redxDistrict,
          area: redxArea,
        });
      }

      if (status === "Cancel") {
        // Ensure comment is provided for cancellation
        if (!comment) {
          console.log("Cancel status selected but no comment provided.");
          return res
            .status(400)
            .json({ message: "Comment is required for cancellation." });
        }
        updateData.comment = comment;
        console.log("Cancel Status - Comment added:", comment);
      }

      if (status === "No Answer") {
        // Increment the attempt count for No Answer status
        updateData.attempt = (req.body.attempt || 0) + 1;
        console.log(
          "No Answer Status - Attempt incremented:",
          updateData.attempt
        );
      }

      if (status === "Schedule Memo") {
        // Ensure scheduleDate is provided for Schedule Memo
        if (!scheduleDate) {
          console.log(
            "Schedule Memo status selected but no schedule date provided."
          );
          return res
            .status(400)
            .json({ message: "Schedule date is required for Schedule Memo." });
        }
        updateData.scheduleDate = scheduleDate;
        console.log(
          "Schedule Memo Status - Schedule date added:",
          scheduleDate
        );
      }

      // Log the final updated data before sending to database
      console.log("Final update data before database update:", updateData);

      try {
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        // Log the result from MongoDB
        console.log("MongoDB update result:", result);

        if (result.modifiedCount > 0) {
          console.log("Order updated successfully!");
          res.status(200).json({ message: "Order updated successfully!" });
        } else {
          console.log("Order not found or no changes made.");
          res.status(404).json({ message: "Order not found" });
        }
      } catch (error) {
        console.error("Error updating order:", error);
        res.status(500).json({ message: "Error updating order", error });
      }
    });

    /**
     * Get Redx Districts and Areas
     */
    app.get("/api/redx", async (req, res) => {
      try {
        const districts = await redxAreaCollection.find({}).toArray();
        res.status(200).json(districts);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching Redx districts", error });
      }
    });

    //=================================================================================================================//
    //=================================================================================================================//
    //=================================================================================================================//
    //=================================================================================================================//
    //=================================================================================================================//
    //=================================================================================================================//
    //=================================================================================================================//

    /**
     * Get Pathaow Districts and Areas
     */
    app.get("/api/pathaow", async (req, res) => {
      try {
        const districts = await pathaowAreaCollection.find({}).toArray();
        res.status(200).json(districts);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error fetching Pathaow districts", error });
      }
    });

    // 1. Add new district
    app.post("/api/pathaow/add-district", async (req, res) => {
      const { district } = req.body;
      if (!district)
        return res.status(400).json({ message: "District name is required" });

      try {
        const existingDistrict = await pathaowAreaCollection.findOne({
          name: district,
        });
        if (existingDistrict)
          return res.status(400).json({ message: "District already exists" });

        const result = await pathaowAreaCollection.insertOne({
          name: district,
        });
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to add district", error });
      }
    });

    // 2. Get all districts
    app.get("/api/pathaow", async (req, res) => {
      try {
        const districts = await pathaowAreaCollection.find({}).toArray();
        res.status(200).json(districts);
      } catch (error) {
        res.status(500).json({ message: "Error fetching districts", error });
      }
    });

    // 3. Delete district
    app.delete("/api/pathaow/delete-district/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await pathaowAreaCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount > 0) {
          res.status(200).json({ message: "District deleted successfully" });
        } else {
          res.status(404).json({ message: "District not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to delete district", error });
      }
    });

    // 4. Bulk Upload Districts via Excel
    app.post(
      "/api/pathaow/bulk-upload",
      upload.single("file"),
      async (req, res) => {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "Please upload a file" });
        }

        try {
          // Read the uploaded Excel file
          const workbook = XLSX.readFile(file.path);
          const sheet = XLSX.utils.sheet_to_json(
            workbook.Sheets[workbook.SheetNames[0]]
          );

          // Store bulk operations to insert or update districts
          const bulkOps = [];

          sheet.forEach((row) => {
            const { District } = row;

            if (District) {
              bulkOps.push({
                updateOne: {
                  filter: { name: District },
                  update: { $setOnInsert: { name: District } },
                  upsert: true,
                },
              });
            }
          });
          if (bulkOps.length > 0) {
            // Perform bulk write operations
            const result = await pathaowAreaCollection.bulkWrite(bulkOps);
            res.status(200).json({ message: "Bulk upload successful", result });
          } else {
            res
              .status(400)
              .json({ message: "No valid data found in the file" });
          }
        } catch (error) {
          res.status(500).json({ message: "Error processing file", error });
        }
      }
    );

    //=========================================================================================================================
    //=========================================================================================================================
    //=========================================================================================================================
    //=========================================================================================================================
    //=========================================================================================================================

    /**
     * RedxArea Routes
     */

    // Add New District
    app.post("/api/redx/add-district", async (req, res) => {
      const { district } = req.body; // Get the district name from request body

      // Validate that district name is provided
      if (!district) {
        return res.status(400).json({ message: "District name is required" });
      }

      try {
        // Check if the district already exists
        const existingDistrict = await redxAreaCollection.findOne({
          name: district,
        });
        if (existingDistrict) {
          return res.status(400).json({ message: "District already exists" });
        }

        // Insert new district
        const result = await redxAreaCollection.insertOne({
          name: district,
          areas: [], // Initially, no areas under the district
        });

        res.status(201).json(result);
      } catch (error) {
        console.error("Failed to add district", error);
        res.status(500).json({ message: "Failed to add district", error });
      }
    });

    // 2. Add Area to a District
    app.post("/api/redx/add-area/:districtId", async (req, res) => {
      const { districtId } = req.params;
      const { area } = req.body;

      if (!area) {
        return res.status(400).json({ message: "Area name is required" });
      }

      try {
        const result = await redxAreaCollection.updateOne(
          { _id: new ObjectId(districtId) },
          { $push: { areas: { _id: new ObjectId(), name: area } } }
        );
        if (result.modifiedCount > 0) {
          const updatedDistrict = await redxAreaCollection.findOne({
            _id: new ObjectId(districtId),
          });
          res.status(200).json(updatedDistrict);
        } else {
          res.status(404).json({ message: "District not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to add area", error });
      }
    });

    // 3. Bulk Upload Districts and Areas
    app.post(
      "/api/redx/bulk-upload",
      upload.single("file"),
      async (req, res) => {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "Please upload a file" });
        }

        try {
          const workbook = XLSX.readFile(file.path);
          const sheet = XLSX.utils.sheet_to_json(
            workbook.Sheets[workbook.SheetNames[0]]
          );
          const bulkOps = [];

          sheet.forEach((row) => {
            const { District: district, Area: area } = row;
            if (district && area) {
              bulkOps.push({
                updateOne: {
                  filter: { name: district },
                  update: {
                    $setOnInsert: { name: district },
                    $addToSet: { areas: { _id: new ObjectId(), name: area } },
                  },
                  upsert: true,
                },
              });
            }
          });

          if (bulkOps.length > 0) {
            const result = await redxAreaCollection.bulkWrite(bulkOps);
            res.status(200).json({ message: "Bulk upload successful", result });
          } else {
            res.status(400).json({ message: "No valid data found in file" });
          }
        } catch (error) {
          res.status(500).json({ message: "Error processing file", error });
        }
      }
    );

    // 4. Update Area
    app.put("/api/redx/update-area/:districtId/:areaId", async (req, res) => {
      const { districtId, areaId } = req.params;
      const { area } = req.body;

      if (!area) {
        return res.status(400).json({ message: "Area name is required" });
      }

      try {
        const result = await redxAreaCollection.updateOne(
          { _id: new ObjectId(districtId), "areas._id": new ObjectId(areaId) },
          { $set: { "areas.$.name": area } }
        );

        if (result.modifiedCount > 0) {
          const updatedDistrict = await redxAreaCollection.findOne({
            _id: new ObjectId(districtId),
          });
          res.status(200).json(updatedDistrict);
        } else {
          res.status(404).json({ message: "Area not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to update area", error });
      }
    });

    // 5. Delete Area
    app.delete(
      "/api/redx/delete-area/:districtId/:areaId",
      async (req, res) => {
        const { districtId, areaId } = req.params;

        try {
          const result = await redxAreaCollection.updateOne(
            { _id: new ObjectId(districtId) },
            { $pull: { areas: { _id: new ObjectId(areaId) } } }
          );

          if (result.modifiedCount > 0) {
            res.status(200).json({ message: "Area deleted successfully" });
          } else {
            res.status(404).json({ message: "Area not found" });
          }
        } catch (error) {
          res.status(500).json({ message: "Failed to delete area", error });
        }
      }
    );

    // 6. Get all districts and areas
    app.get("/api/redx", async (req, res) => {
      try {
        const districts = await redxAreaCollection.find({}).toArray();
        res.status(200).json(districts);
      } catch (error) {
        res.status(500).json({ message: "Error fetching data", error });
      }
    });

    // =============================================================================================================
    // =============================================================================================================
    // =============================================================================================================
    // =============================================================================================================

    /**
     * User Routes
     */

    // 1. Get user by UID
    app.get("/api/users/:uid", async (req, res) => {
      const { uid } = req.params;
      try {
        const user = await usersCollection.findOne({ uid });
        if (user) {
          res.status(200).json(user);
        } else {
          res.status(404).json({ message: "User not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Error fetching user", error });
      }
    });

    // 2. Add a new user
    app.post("/api/users", async (req, res) => {
      const { userName, email, uid } = req.body;
      try {
        const result = await usersCollection.insertOne({
          userName,
          email,
          uid,
          createdAt: new Date(),
        });
        res
          .status(201)
          .json({ message: "User stored in database successfully", result });
      } catch (error) {
        res.status(500).json({ message: "Failed to store user", error });
      }
    });

    // 3. Get all users
    app.get("/api/users", async (req, res) => {
      try {
        const users = await usersCollection.find({}).toArray();
        res.status(200).json(users);
      } catch (error) {
        res.status(500).json({ message: "Failed to retrieve users", error });
      }
    });

    // 4. Update user role
    app.put("/api/users/:id/role", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );
        if (result.modifiedCount > 0) {
          res.status(200).json({ message: "Role updated successfully" });
        } else {
          res
            .status(404)
            .json({ message: "User not found or no changes made" });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to update role", error });
      }
    });

    // 5. Delete user
    app.delete("/api/users/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount > 0) {
          res.status(200).json({ message: "User deleted successfully" });
        } else {
          res.status(404).json({ message: "User not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to delete user", error });
      }
    });

    //************************************************************************************************************ */

    // In your backend
    app.get("/api/orders/check-invoice", async (req, res) => {
      const { invoiceId } = req.query;

      if (!invoiceId) {
        return res.status(400).json({ message: "Invoice ID is required" });
      }

      try {
        const order = await ordersCollection.findOne({ invoiceId });
        if (order) {
          return res.json({ exists: true });
        }
        return res.json({ exists: false });
      } catch (error) {
        console.error("Error checking invoice ID:", error);
        res.status(500).json({ message: "Failed to check invoice ID", error });
      }
    });
    //************************************************************************************************************ */

    // 1. Create an exchange order
    app.post("/api/orders/exchange", async (req, res) => {
      const {
        invoiceId,
        date,
        pageName,
        customerName,
        phoneNumber,
        address,
        note,
        status = "Exchange",
        consignmentId,
        products,
        deliveryCost,
        advance,
        discount,
        grandTotal,
      } = req.body;

      console.log("Received Data:", req.body); // Log incoming data

      // Field validation checks
      if (
        !invoiceId ||
        !customerName ||
        !Array.isArray(products) ||
        products.length === 0
      ) {
        console.error("Validation Error: Missing required fields");
        return res.status(400).json({ message: "Missing required fields" });
      }

      const order = {
        invoiceId,
        date: date || new Date(),
        pageName,
        customerName,
        phoneNumber,
        address,
        note,
        consignmentId,
        products,
        deliveryCost: deliveryCost || 0,
        advance: advance || 0,
        discount: discount || 0,
        grandTotal: grandTotal || 0,
        status,
        createdAt: new Date(),
      };

      console.log("Order to Insert:", order); // Log the order structure to be inserted

      try {
        const insertResult = await ordersCollection.insertOne(order);
        console.log("Insert Result:", insertResult); // Log the result of insertion
        res.status(201).json({ message: "Exchange created successfully!" });
      } catch (error) {
        console.error("Error creating exchange:", error);
        res
          .status(500)
          .json({ message: "Failed to create exchange order", error });
      }
    });

    //************************************************************************************************************ */
    app.get("/api/facebook-pages/last-code", async (req, res) => {
      const name = req.query.name; // Extracts the name from the query
      try {
        const page = await facebookPagesCollection.findOne({ pageName: name }); // Searches by pageName
        if (page) {
          res.json({ lastCode: page.lastCode || "" });
        } else {
          res.status(404).json({ message: "Page not found" });
        }
      } catch (error) {
        console.error("Error fetching lastCode:", error);
        res.status(500).json({ message: "Server error" });
      }
    });
    /**
     * Order Routes
     */

    // 1. Create an order
    app.post("/api/orders", async (req, res) => {
      const {
        invoiceId,
        date,
        pageName,
        customerName,
        phoneNumber,
        address,
        note,
        products,
        deliveryCost,
        advance,
        discount,
        status,
        grandTotal,
      } = req.body;

      const order = {
        invoiceId,
        date: date || new Date(),
        pageName,
        customerName,
        phoneNumber,
        address,
        note,
        products,
        status,
        deliveryCost: deliveryCost || 0,
        advance: advance || 0,
        discount: discount || 0,
        grandTotal: grandTotal || 0,
        createdAt: new Date(),
      };

      try {
        // Insert order into OrderManagement
        await ordersCollection.insertOne(order);

        // Update lastCode in FacebookPages
        await facebookPagesCollection.updateOne(
          { pageName: pageName },
          { $set: { lastCode: invoiceId } }
        );

        res.status(201).json({
          message: "Order created and lastCode updated successfully!",
        });
      } catch (error) {
        console.error("Error creating order or updating lastCode:", error);
        res.status(500).json({
          message: "Failed to create order and update lastCode",
          error,
        });
      }
    });

    // 2. Get all orders
    app.get("/api/orders", async (req, res) => {
      try {
        const orders = await ordersCollection.find({}).toArray();
        res.status(200).json(orders);
      } catch (error) {
        res.status(500).json({ message: "Failed to retrieve orders", error });
      }
    });

    // 3. Bulk assign orders to users
    app.post("/api/orders/bulk-assign", async (req, res) => {
      const { orderIds, assignedUser } = req.body;
      try {
        const result = await ordersCollection.updateMany(
          { _id: { $in: orderIds.map((id) => new ObjectId(id)) } },
          { $set: { assignedTo: assignedUser } }
        );
        res.status(200).json({ message: "Orders assigned successfully!" });
      } catch (error) {
        res.status(500).json({ message: "Failed to assign orders", error });
      }
    });

    // 4. Delete order
    app.delete("/api/orders/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await ordersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount > 0) {
          res.status(200).json({ message: "Order deleted successfully!" });
        } else {
          res.status(404).json({ message: "Order not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to delete order", error });
      }
    });

    //************************************************************************************************************** */
    //************************************************************************************************************** */
    //************************************************************************************************************** */
    //************************************************************************************************************** */
    /**
     * Product Routes
     */

    app.get("/api/products/:parentCode/skus", async (req, res) => {
      const parentCode = req.params.parentCode;

      try {
        const collection = client.db("Trendy_management").collection("Product");
        const product = await collection.findOne(
          { _id: parentCode },
          { projection: { "parentcode.subproduct": 1 } }
        );

        if (product) {
          res.status(200).json({ skus: product.parentcode.subproduct });
        } else {
          res.status(404).json({ message: "Parent Code not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to retrieve SKUs", error });
      }
    });

    // 1. Add parent product
    app.post("/api/products/add-parent", async (req, res) => {
      const { _id } = req.body; // Parent code
      try {
        const newProduct = { _id, parentcode: { subproduct: [] } };
        await productCollection.insertOne(newProduct);
        res.status(201).json({ message: "Parent code added successfully!" });
      } catch (error) {
        res.status(500).json({ message: "Failed to add parent code", error });
      }
    });

    // Get all parent codes
    app.get("/api/products/parent-codes", async (req, res) => {
      const { search = "", page = 1, limit = 20 } = req.query;

      const regex = new RegExp(search, "i"); // Case-insensitive search
      try {
        const parentCodes = await productCollection
          .find({ _id: { $regex: regex } }) // Assuming `_id` is the parent code field
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .toArray();

        res.status(200).json(parentCodes);
      } catch (error) {
        console.error("Error fetching parent codes:", error);
        res.status(500).json({ message: "Failed to fetch parent codes." });
      }
    });

    //Fetch SKUs for a Parent SKU:
    app.get("/api/products/:parent-codes/skus", async (req, res) => {
      const { parentSku } = req.params;
      const collection = client.db("Trendy_management").collection("Product");

      try {
        const product = await collection.findOne({ _id: parentSku });
        if (product) {
          res.json({ skus: product.parentcode.subproduct }); // Ensure subproduct includes price in the response
        } else {
          res.status(404).json({ message: "Parent SKU not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Error fetching SKUs", error });
      }
    });

    // Add subproduct under a specific parent code
    app.post("/api/products/add-subproduct/:parentId", async (req, res) => {
      const { parentId } = req.params;
      const subproduct = req.body; // Expecting subproduct data

      try {
        const collection = client.db("Trendy_management").collection("Product");
        await collection.updateOne(
          { _id: parentId },
          { $push: { "parentcode.subproduct": subproduct } }
        );
        res.status(200).json({ message: "Subproduct added successfully!" });
      } catch (error) {
        res.status(500).json({ message: "Failed to add subproduct", error });
      }
    });

    // 2. Bulk upload products
    app.post("/api/products/bulk-upload", async (req, res) => {
      const { products } = req.body;
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({
          message: "Invalid data format. Products should be an array.",
        });
      }

      try {
        // Create an array of bulk operations
        const bulkOps = [];

        for (let product of products) {
          const parentcode = product.parentcode;
          const subproduct = {
            sku: product.sku,
            name: product.name,
            buying_price: parseFloat(product.buying_price), // Ensure numeric value
            selling_price: parseFloat(product.selling_price), // Ensure numeric value
            quantity: parseInt(product.quantity, 10), // Ensure numeric value
          };

          // Check if the parent product exists, if so, either update or push the subproduct
          const parentProduct = await productCollection.findOne({
            _id: parentcode,
          });

          if (parentProduct) {
            const subproductExists = parentProduct.parentcode.subproduct.some(
              (sub) => sub.sku === subproduct.sku
            );

            if (subproductExists) {
              // Update existing subproduct
              bulkOps.push({
                updateOne: {
                  filter: {
                    _id: parentcode,
                    "parentcode.subproduct.sku": subproduct.sku,
                  },
                  update: {
                    $set: {
                      "parentcode.subproduct.$.name": subproduct.name,
                      "parentcode.subproduct.$.buying_price":
                        subproduct.buying_price,
                      "parentcode.subproduct.$.selling_price":
                        subproduct.selling_price,
                      "parentcode.subproduct.$.quantity": subproduct.quantity,
                    },
                  },
                },
              });
            } else {
              // Add new subproduct
              bulkOps.push({
                updateOne: {
                  filter: { _id: parentcode },
                  update: { $push: { "parentcode.subproduct": subproduct } },
                },
              });
            }
          } else {
            // Create new parent product with subproduct
            bulkOps.push({
              insertOne: {
                document: {
                  _id: parentcode,
                  parentcode: { subproduct: [subproduct] },
                },
              },
            });
          }
        }

        // Perform the bulk write operation
        if (bulkOps.length > 0) {
          const result = await productCollection.bulkWrite(bulkOps);
          res
            .status(200)
            .json({ message: "Products uploaded successfully", result });
        } else {
          res.status(400).json({ message: "No valid operations to perform" });
        }
      } catch (error) {
        console.error("Error uploading products:", error);
        res.status(500).json({ message: "Error uploading products", error });
      }
    });

    // 3. Get all products
    app.get("/api/products", async (req, res) => {
      try {
        const products = await productCollection.find({}).toArray();
        res.status(200).json(products);
      } catch (error) {
        res.status(500).json({ message: "Error fetching products", error });
      }
    });

    // 4. Delete a subproduct
    app.delete("/api/products/:id/subproduct/:sku", async (req, res) => {
      const { id, sku } = req.params;
      try {
        const result = await productCollection.updateOne(
          { _id: id },
          { $pull: { "parentcode.subproduct": { sku } } }
        );
        if (result.modifiedCount > 0) {
          res.status(200).json({ message: "Subproduct deleted successfully" });
        } else {
          res
            .status(404)
            .json({ message: "Subproduct not found or already deleted" });
        }
      } catch (error) {
        res.status(500).json({ message: "Error deleting subproduct", error });
      }
    });

    // 5. Update product
    app.put("/api/products/:id", async (req, res) => {
      const { id } = req.params;
      const updatedProduct = req.body;
      try {
        const result = await productCollection.updateOne(
          { _id: id },
          { $set: updatedProduct }
        );
        if (result.modifiedCount > 0) {
          res.status(200).json({ message: "Product updated successfully!" });
        } else {
          res
            .status(404)
            .json({ message: "Product not found or no changes made." });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to update product", error });
      }
    });

    //********************************************************************************************************************************
    //********************************************************************************************************************************
    //********************************************************************************************************************************

    /*************************************************************************
     * Facebook Pages Routes
     ******************************************************************************/
    // 1. Create a Facebook Page
    app.post("/api/facebook-pages/create", async (req, res) => {
      const { pageName } = req.body;
      if (!pageName) {
        return res.status(400).json({ message: "Page name is required." });
      }

      try {
        const newPage = { pageName, createdAt: new Date() };
        await facebookPagesCollection.insertOne(newPage);
        res
          .status(201)
          .json({ message: "Facebook page created successfully!", newPage });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error creating Facebook page", error });
      }
    });

    // 2. Get all Facebook pages
    app.get("/api/facebook-pages", async (req, res) => {
      try {
        const pages = await facebookPagesCollection.find({}).toArray();
        res.status(200).json(pages);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Failed to retrieve Facebook pages", error });
      }
    });

    // 3. Update a Facebook page
    app.put("/api/facebook-pages/:id", async (req, res) => {
      const { id } = req.params;
      const { pageName } = req.body;
      try {
        const result = await facebookPagesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { pageName } }
        );
        if (result.modifiedCount > 0) {
          res.status(200).json({ message: "Page updated successfully!" });
        } else {
          res
            .status(404)
            .json({ message: "Page not found or no changes made." });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to update page", error });
      }
    });

    // 4. Delete a Facebook page
    app.delete("/api/facebook-pages/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await facebookPagesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount > 0) {
          res.status(200).json({ message: "Page deleted successfully!" });
        } else {
          res.status(404).json({ message: "Page not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to delete page", error });
      }
    });

    //************************************************************************************************
    //************************************************************************************************
    //************************************************************************************************
    //************************************************************************************************
    //************************************************************************************************
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

// Default route for health check
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
