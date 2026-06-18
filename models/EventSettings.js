const mongoose = require('mongoose');

const eventSettingsSchema = new mongoose.Schema({
  eventName: { type: String, default: 'The Moments' },
  eventSubtitle: { type: String, default: 'Retreat Event' },
  coverImage: { type: String, default: '' },
  recapCoverImage: { type: String, default: '' },
  recapSlug: { type: String, default: 'moments', unique: true, index: true },
  eventStartDate: { type: Date, default: Date.now },
  eventEndDate: { type: Date, default: Date.now },
  eventDays: { type: Number, default: 1 }
});

module.exports = mongoose.model('EventSettings', eventSettingsSchema);
