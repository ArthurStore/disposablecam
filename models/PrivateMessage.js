const mongoose = require('mongoose');

const privateMessageSchema = new mongoose.Schema({
  fromParticipantNumber: { type: String, required: true, index: true },
  fromFullName: { type: String, required: true },
  toParticipantNumber: { type: String, required: true, index: true },
  toFullName: { type: String, required: true },
  text: { type: String, default: '', maxlength: 500 },
  mediaFilename: { type: String, default: '' },
  mediaType: { type: String, enum: ['', 'image', 'video'], default: '' },
  sentAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PrivateMessage', privateMessageSchema);
