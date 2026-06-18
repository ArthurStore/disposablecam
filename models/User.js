const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  participantNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  gender: {
    type: String,
    enum: ['L', 'P', 'Laki - Laki', 'Perempuan'],
    required: true
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  registeredAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
