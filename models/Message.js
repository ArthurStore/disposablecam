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
    default: '',
    maxlength: 500
  },
  mediaFilename: { type: String, default: '' },
  mediaType: { type: String, enum: ['', 'image', 'video'], default: '' },
  sentAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', messageSchema);
