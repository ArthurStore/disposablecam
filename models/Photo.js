const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  participantNumber: {
    type: String,
    required: true,
    index: true
  },
  fullName: {
    type: String,
    required: true
  },
  gender: {
    type: String,
    enum: ['L', 'P'],
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    default: ''
  },
  mimetype: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['photo', 'video'],
    required: true
  },
  caption: {
    type: String,
    default: ''
  },
  fileSize: {
    type: Number,
    default: 0
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Photo', photoSchema);
