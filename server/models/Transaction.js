const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  _id: { type: String }, // Apple transactionId — used as PK to prevent duplicate grants
  userId: { type: String, required: true, index: true },
  productId: { type: String, required: true },
  coins: { type: Number, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
