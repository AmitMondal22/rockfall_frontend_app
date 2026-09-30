import { Building2, Grid, Shield, Zap, Boxes } from 'lucide-react';

export const BARRIER_STYLES = {
  FENCE_BARRIER: {
    name: 'Flexible Catch Fence',
    lineColor: '#f59e0b', // Amber/gold steel
    glowColor: '#b45309',
    dashArray: '12, 6',
    weight: 6,
    Icon: Shield
  },
  DRAPERY_NET: {
    name: 'Drapery Mesh / Wire Net',
    lineColor: '#10b981', // Emerald wire mesh
    glowColor: '#047857',
    dashArray: '6, 6',
    weight: 5,
    Icon: Grid
  },
  ROCK_SHED: {
    name: 'Protective Rock Shed',
    lineColor: '#94a3b8', // Concrete/steel gallery
    glowColor: '#334155',
    dashArray: null,
    weight: 8,
    Icon: Building2
  },
  ATTENUATOR: {
    name: 'Attenuator System',
    lineColor: '#6366f1', // Indigo dynamic absorber
    glowColor: '#4338ca',
    dashArray: '16, 4, 4, 4',
    weight: 6,
    Icon: Zap
  },
  EMBANKMENT: {
    name: 'Reinforced Embankment',
    lineColor: '#ea580c', // Earthy terracotta
    glowColor: '#9a3412',
    dashArray: null,
    weight: 9,
    Icon: Boxes
  }
};

export default BARRIER_STYLES;
