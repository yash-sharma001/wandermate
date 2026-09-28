import React from 'react';
import { MapPin, Coffee, BedDouble, Mountain, Umbrella, Utensils, Camera, Sparkles, Leaf, Bike, Castle, Sailboat, TrainFront, Backpack, Sunset, Flame, Drama } from 'lucide-react';

// Journal moods: stored as a key in pins.mood_emoji (older rows may hold an emoji, which we render as text)
export const MOODS = [
  { key: 'pin', label: 'Place', icon: MapPin },
  { key: 'coffee', label: 'Chai & coffee', icon: Coffee },
  { key: 'stay', label: 'Stay', icon: BedDouble },
  { key: 'mountain', label: 'Mountains', icon: Mountain },
  { key: 'beach', label: 'Beach', icon: Umbrella },
  { key: 'food', label: 'Food', icon: Utensils },
  { key: 'photo', label: 'Photo spot', icon: Camera },
  { key: 'magic', label: 'Magical', icon: Sparkles },
  { key: 'peace', label: 'Peaceful', icon: Leaf },
  { key: 'ride', label: 'Ride', icon: Bike },
  { key: 'fort', label: 'Heritage', icon: Castle },
  { key: 'river', label: 'River', icon: Sailboat },
  { key: 'train', label: 'Journey', icon: TrainFront },
  { key: 'pack', label: 'Adventure', icon: Backpack },
  { key: 'sunset', label: 'Sunset', icon: Sunset },
  { key: 'aarti', label: 'Spiritual', icon: Flame },
  { key: 'show', label: 'Culture', icon: Drama },
];

export const moodOf = (key) => MOODS.find((m) => m.key === key);

export const MoodIcon = ({ mood, size = 14 }) => {
  const m = moodOf(mood);
  if (m) return React.createElement(m.icon, { size });
  return mood ? <span>{mood}</span> : React.createElement(MapPin, { size });
};
