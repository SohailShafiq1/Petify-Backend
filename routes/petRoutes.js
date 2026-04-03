const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Pet = require("../models/Pet");
const authMiddleware = require("../middleware/authMiddleware");

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
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Create pet
router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { name, category, age, description, price, ownerContact } = req.body;

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
