const mongoose = require("mongoose");

const petSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
    },
    age: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    ownerName: {
      type: String,
      required: true,
    },
    ownerContact: {
      type: String,
      required: true,
    },
    ownerId: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    buyerName: {
      type: String,
      default: null,
    },
    buyerContact: {
      type: String,
      default: null,
    },
    buyerAddress: {
      type: String,
      default: null,
    },
    soldAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Pet", petSchema);
