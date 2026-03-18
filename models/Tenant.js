const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  nicho: { type: String, required: true },
  systemPromptBase: String,
  trainingData: String,
  ownerUserId: String,
  contactInfo: {
    whatsapp: String,
    address: String
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Tenant', TenantSchema);