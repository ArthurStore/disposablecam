const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminPinSchema = new mongoose.Schema({
  pin: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

adminPinSchema.pre('save', async function (next) {
  if (!this.isModified('pin')) return next();
  this.pin = await bcrypt.hash(this.pin, 12);
  next();
});

adminPinSchema.methods.comparePin = async function (candidatePin) {
  return bcrypt.compare(candidatePin, this.pin);
};

module.exports = mongoose.model('AdminPin', adminPinSchema);
