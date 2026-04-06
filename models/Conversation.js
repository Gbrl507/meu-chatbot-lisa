const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'] },
  content: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const ConversationSchema = new mongoose.Schema({
  slug: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  messages: [MessageSchema],
  score: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['active', 'hot', 'warm', 'cold', 'closed'],
    default: 'active'
  },
  leadName: { type: String, default: 'Lead' },
  converted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Conversation', ConversationSchema);