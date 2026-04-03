const express = require("express");
const ChatMessage = require("../models/ChatMessage");
const Pet = require("../models/Pet");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Get chat messages for a pet
router.get("/:petId", authMiddleware, async (req, res) => {
  try {
    const petId = req.params.petId;

    const pet = await Pet.findById(petId);
    if (!pet) {
      return res.status(404).json({ message: "Pet not found" });
    }

    const messages = await ChatMessage.find({ petId })
      .sort({ createdAt: 1 })
      .limit(500);

    return res.status(200).json({ messages });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Send message for a pet
router.post("/:petId", authMiddleware, async (req, res) => {
  try {
    const petId = req.params.petId;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    const pet = await Pet.findById(petId);
    if (!pet) {
      return res.status(404).json({ message: "Pet not found" });
    }

    const senderName = req.user.email ? req.user.email.split("@")[0] : "User";

    const chatMessage = await ChatMessage.create({
      petId,
      senderId: req.user.userId,
      senderName,
      message: message.trim(),
    });

    return res.status(201).json({ message: "Message sent", chatMessage });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
