const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  participantNumber: {
    type: String,
    required: true
  },
  fullName: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 500
  },
  sentAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', messageSchema);
