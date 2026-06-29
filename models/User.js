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
  nickname: {
    type: String,
    trim: true,
    default: ''
  },
  gender: {
    type: String,
    enum: ['L', 'P', 'Laki - Laki', 'Perempuan'],
    required: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
    default: null
  },
  password: {
    type: String,
    default: null
  },
  dateOfBirth: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'banned'],
    default: 'active'
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
