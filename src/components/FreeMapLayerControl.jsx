import React, { useState } from 'react';
import { Layers, Check, Globe, Moon, Sun, Mountain, Eye, Compass } from 'lucide-react';

/**
 * FreeMapLayerControl — Sleek floating layer switcher for Leaflet Maps.
 * 100% Free Open-Source & ESRI Public tiles with zero watermark and zero API keys.
 */
export default function FreeMapLayerControl({
  currentLayerId,
  onSelectLayer,
  isDark = true,
  position = 'top-right'
}) {
  const [open, setOpen] = useState(false);

  const options = [
    { id: 'auto', name: isDark ? 'Auto (Dark Canvas)' : 'Auto (OpenStreetMap)', icon: isDark ? Moon : Sun, desc: 'Adapts to system theme' },
    { id: 'esriDark', name: 'Dark Canvas', icon: Moon, desc: 'Clean dark basemap (no watermark)' },
    { id: 'osm', name: 'OpenStreetMap', icon: Globe, desc: 'Standard open street map' },
    { id: 'osmHot', name: 'Humanitarian (HOT)', icon: Sun, desc: 'Detailed high-visibility light map' },
    { id: 'esriSatellite', name: 'Satellite View', icon: Eye, desc: 'High-res satellite aerial imagery' },
    { id: 'esriStreet', name: 'World Street Map', icon: Compass, desc: 'High-precision global street network' },
    { id: 'esriTopo', name: 'Topographic / Terrain', icon: Mountain, desc: 'Terrain elevation contours & mountains' }
  ];

  const posClasses = {
    'top-right': 'top-3 right-3',
    'top-left': 'top-3 left-14',
    'bottom-right': 'bottom-3 right-3',
    'bottom-left': 'bottom-3 left-3'
  };

  return (
    <div className={`absolute ${posClasses[position] || 'top-3 right-3'} z-[400]`}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-lg backdrop-blur-md border transition-all duration-200 ${isDark
            ? 'bg-black/80 hover:bg-black/95 text-white border-white/15 hover:border-white/30'
            : 'bg-white/90 hover:bg-white text-slate-900 border-slate-200/80 hover:border-slate-300'
            }`}
          title="Change Map Style (100% Free • No Watermark)"
        >
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Map Layers</span>

        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-[401]" onClick={() => setOpen(false)} />
            <div
              className={`absolute right-0 mt-2 w-60 p-2 rounded-2xl shadow-2xl border backdrop-blur-xl z-[402] animate-in fade-in zoom-in-95 duration-150 ${isDark ? 'bg-[#14171c]/95 border-white/10 text-white' : 'bg-white/95 border-slate-200 text-slate-900'
                }`}
            >
              <div className="px-2.5 py-1.5 border-b border-border/40 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Basemap Layer</span>

              </div>
              <div className="py-1 space-y-0.5 max-h-72 overflow-y-auto">
                {options.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = currentLayerId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onSelectLayer(opt.id);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs text-left transition-all ${isSelected
                        ? isDark
                          ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                          : 'bg-indigo-50 text-indigo-700 font-semibold'
                        : isDark
                          ? 'hover:bg-white/5 text-slate-300'
                          : 'hover:bg-slate-100 text-slate-700'
                        }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-text-muted'}`} />
                        <div className="truncate">
                          <p className="truncate leading-tight">{opt.name}</p>
                          <p className="text-[9px] text-text-dim truncate">{opt.desc}</p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-1.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
