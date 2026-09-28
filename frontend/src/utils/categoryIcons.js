import { Leaf, Waves, BedDouble, Tent, Coffee, Camera, Mountain, Compass, Landmark, PawPrint, Umbrella, Sparkles, Image } from 'lucide-react';

// Shop + trip categories -> a recognisable icon (used on cover placeholders)
const ICONS = {
  Yoga: Leaf, Rafting: Waves, Stays: BedDouble, Camping: Tent, Cafe: Coffee, Photography: Camera, Adventure: Compass,
  Trekking: Mountain, Wellness: Sparkles, Cultural: Landmark, Pilgrimage: Landmark, Wildlife: PawPrint, Beach: Umbrella,
};

export const categoryIcon = (category) => ICONS[category] || Image;
