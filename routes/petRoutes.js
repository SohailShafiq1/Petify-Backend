const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Pet = require("../models/Pet");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { analyzePetImage } = require("../utils/grokAnalyzer");

const router = express.Router();

// Setup multer for image uploads
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "pet-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    
    const fileExt = path.extname(file.originalname).toLowerCase();
    const isMimeAllowed = allowedMimes.includes(file.mimetype);
    const isExtAllowed = allowedExts.includes(fileExt);
    
    // Accept if MIME type matches OR file extension matches
    if (isMimeAllowed || isExtAllowed) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (jpg, jpeg, png, gif, webp)"));
    }
  },
});

// Analyze pet image using Grok AI
router.post("/analyze-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    // Analyze the image using Grok
    const petDetails = await analyzePetImage(req.file.path);

    return res.status(200).json({
      message: "Image analyzed successfully",
      petDetails,
    });
  } catch (error) {
    console.error("Error analyzing image:", error.message);
    // If the error contains an upstream HTTP response (e.g., from Grok), include details
    const upstreamStatus = error.response?.status;
    const upstreamBody = error.response?.data;
    return res.status(502).json({
      message: "Error analyzing image",
      error: error.message,
      upstreamStatus: upstreamStatus || null,
      upstreamBody: upstreamBody || null,
    });
  } finally {
    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// Create pet
router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { name, category, age, description, price, ownerContact, breed, origin } = req.body;

    if (!name || !category || age === undefined || !description || !price || !ownerContact) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        message: "All fields are required: name, category, age, description, price, ownerContact",
      });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const pet = await Pet.create({
      name,
      category,
      breed: breed || null,
      origin: origin || null,
      age: parseInt(age),
      description,
      price: parseFloat(price),
      ownerName: req.user.email.split("@")[0],
      ownerContact,
      ownerId: req.user.userId,
      imageUrl,
      isAvailable: true,
    });

    return res.status(201).json({
      message: "Pet listed successfully",
      pet,
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get all pets
router.get("/", async (req, res) => {
  try {
    const pets = await Pet.find({ isAvailable: true })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.status(200).json({ pets });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get my pets (user's own listings)
router.get("/my-pets", authMiddleware, async (req, res) => {
  try {
    const pets = await Pet.find({ ownerId: req.user.userId }).sort({ createdAt: -1 });

    return res.status(200).json({ pets });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get my orders (pets I bought)
router.get("/my-orders", authMiddleware, async (req, res) => {
  try {
    const pets = await Pet.find({ buyerId: req.user.userId }).sort({ soldAt: -1 });
    return res.status(200).json({ pets });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get my sales (pets I sold)
router.get("/my-sales", authMiddleware, async (req, res) => {
  try {
    const pets = await Pet.find({ ownerId: req.user.userId, isAvailable: false })
      .sort({ soldAt: -1 });
    return res.status(200).json({ pets });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get pets by category
router.get("/category/:category", async (req, res) => {
  try {
    const pets = await Pet.find({
      category: req.params.category,
      isAvailable: true,
    }).sort({ createdAt: -1 });

    return res.status(200).json({ pets });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Search pets
router.get("/search", async (req, res) => {
  try {
    const query = (req.query.q || '').toString().trim();
    if (!query) {
      return res.status(200).json({ pets: [] });
    }

    const buildQuery = (field) => ({
      isAvailable: true,
      [field]: { $regex: query, $options: "i" },
    });

    const breedMatches = await Pet.find(buildQuery("breed"))
      .sort({ createdAt: -1 })
      .limit(100);

    const nameMatches = await Pet.find({
      isAvailable: true,
      name: { $regex: query, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .limit(100);

    const categoryMatches = await Pet.find({
      isAvailable: true,
      category: { $regex: query, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .limit(100);

    const descriptionMatches = await Pet.find({
      isAvailable: true,
      description: { $regex: query, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .limit(100);

    const seenIds = new Set();
    const pets = [];

    [breedMatches, nameMatches, categoryMatches, descriptionMatches].forEach((list) => {
      list.forEach((pet) => {
        const petId = pet._id.toString();
        if (!seenIds.has(petId)) {
          seenIds.add(petId);
          pets.push(pet);
        }
      });
    });

    return res.status(200).json({ pets });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get favorite pets
router.get("/favorites", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const favoriteIds = user.favorites || [];
    if (favoriteIds.length === 0) {
      return res.status(200).json({ pets: [] });
    }

    const pets = await Pet.find({ _id: { $in: favoriteIds } }).sort({ createdAt: -1 });
    return res.status(200).json({ pets });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Toggle favorite
router.post("/:id/favorite", authMiddleware, async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);
    if (!pet) {
      return res.status(404).json({ message: "Pet not found" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const petId = pet._id.toString();
    const favorites = user.favorites || [];
    const alreadyFavorite = favorites.includes(petId);

    if (alreadyFavorite) {
      user.favorites = favorites.filter((id) => id !== petId);
    } else {
      user.favorites = [...favorites, petId];
    }

    await user.save();

    return res.status(200).json({
      message: alreadyFavorite ? "Removed from favorites" : "Added to favorites",
      isFavorite: !alreadyFavorite,
      favorites: user.favorites,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get pet by ID
router.get("/:id", async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) {
      return res.status(404).json({ message: "Pet not found" });
    }

    return res.status(200).json({ pet });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update pet
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) {
      return res.status(404).json({ message: "Pet not found" });
    }

    if (pet.ownerId !== req.user.userId) {
      return res.status(403).json({ message: "Not authorized to update this pet" });
    }

    const { name, category, age, description, price, ownerContact, isAvailable } = req.body;

    if (name) pet.name = name;
    if (category) pet.category = category;
    if (age !== undefined) pet.age = parseInt(age);
    if (description) pet.description = description;
    if (price !== undefined) pet.price = parseFloat(price);
    if (ownerContact) pet.ownerContact = ownerContact;
    if (isAvailable !== undefined) pet.isAvailable = isAvailable;

    await pet.save();

    return res.status(200).json({
      message: "Pet updated successfully",
      pet,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Buy pet (Cash on Delivery) - marks as sold
router.post("/:id/buy", authMiddleware, async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) {
      return res.status(404).json({ message: "Pet not found" });
    }

    if (!pet.isAvailable) {
      return res.status(400).json({ message: "Pet is already sold" });
    }

    if (pet.ownerId === req.user.userId) {
      return res.status(400).json({ message: "You cannot buy your own pet" });
    }

    const { buyerName, buyerContact, buyerAddress } = req.body;

    if (!buyerName || !buyerContact || !buyerAddress) {
      return res.status(400).json({
        message: "Buyer name, contact number, and address are required",
      });
    }

    pet.isAvailable = false;
    pet.buyerName = buyerName.trim();
    pet.buyerId = req.user.userId;
    pet.buyerContact = buyerContact.trim();
    pet.buyerAddress = buyerAddress.trim();
    pet.soldAt = new Date();
    pet.deliveryStatus = "pending";
    pet.deliveredAt = null;
    await pet.save();

    return res.status(200).json({
      message: "Purchase successful. Cash on Delivery confirmed.",
      pet,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Mark delivery completed (owner only)
router.post("/:id/complete-delivery", authMiddleware, async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) {
      return res.status(404).json({ message: "Pet not found" });
    }

    if (pet.ownerId !== req.user.userId) {
      return res.status(403).json({ message: "Not authorized to update delivery" });
    }

    if (pet.isAvailable) {
      return res.status(400).json({ message: "Pet is not sold" });
    }

    if (pet.deliveryStatus === "completed") {
      return res.status(400).json({ message: "Delivery already completed" });
    }

    pet.deliveryStatus = "completed";
    pet.deliveredAt = new Date();
    await pet.save();

    return res.status(200).json({
      message: "Delivery marked as completed",
      pet,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});


// Delete pet
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const pet = await Pet.findById(req.params.id);

    if (!pet) {
      return res.status(404).json({ message: "Pet not found" });
    }

    if (pet.ownerId !== req.user.userId) {
      return res.status(403).json({ message: "Not authorized to delete this pet" });
    }

    await Pet.deleteOne({ _id: req.params.id });

    return res.status(200).json({ message: "Pet deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
