import { Coffee, Mountain, Moon, Leaf, Soup, Palette, Camera, Tent, Globe, Landmark, Users, MapPin } from 'lucide-react';

// Activity categories from the design; also the values stored in activities.activity_type
export const ACTIVITY_TYPES = [
  { value: 'Cafe', label: 'Cafe', icon: Coffee },
  { value: 'Hike', label: 'Hike', icon: Mountain },
  { value: 'Night Out', label: 'Night out', icon: Moon },
  { value: 'Wellness', label: 'Wellness', icon: Leaf },
  { value: 'Foodie', label: 'Foodie', icon: Soup },
  { value: 'Creative', label: 'Creative', icon: Palette },
  { value: 'Photo', label: 'Photo', icon: Camera },
  { value: 'Getaway', label: 'Getaway', icon: Tent },
  { value: 'Sports', label: 'Sports', icon: Globe },
  { value: 'Spiritual', label: 'Spiritual', icon: Landmark },
  { value: 'Meetup', label: 'Meetup', icon: Users },
];

export const typeIcon = (type) => ACTIVITY_TYPES.find((t) => t.value === type)?.icon || MapPin;
export const typeLabel = (type) => ACTIVITY_TYPES.find((t) => t.value === type)?.label || type;

export const formatWhen = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return same ? `Today, ${time}` : `${d.toLocaleDateString([], { weekday: 'short' })}, ${time}`;
};

export const initials = (name = '') => name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
