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
    breed: {
      type: String,
      default: null,
    },
    origin: {
      type: String,
      default: null,
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
    buyerId: {
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
    deliveryStatus: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    reviews: [
      {
        buyerId: {
          type: String,
          required: true,
        },
        buyerName: {
          type: String,
          required: true,
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        comment: {
          type: String,
          required: true,
          trim: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Pet", petSchema);
