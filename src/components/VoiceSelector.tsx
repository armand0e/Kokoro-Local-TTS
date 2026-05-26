"use client";

interface VoiceInfo {
  name: string;
  language: string;
  gender: "Male" | "Female";
  traits?: string;
}

interface VoiceSelectorProps {
  voices: Record<string, VoiceInfo>;
  selectedVoice: string;
  onChange: (voice: string) => void;
  disabled?: boolean;
}

export function VoiceSelector({ voices, selectedVoice, onChange, disabled }: VoiceSelectorProps) {
  // Group voices by category and gender
  const voiceGroups: Record<string, { id: string; name: string; language: string; traits?: string }[]> = {};
  let heartVoice: { id: string; name: string; language: string; traits?: string } | null = null;

  for (const [id, voice] of Object.entries(voices)) {
    if (id === "af_heart") {
      heartVoice = { id, name: voice.name, language: voice.language, traits: voice.traits };
      continue;
    }
    const category = id.split("_")[0];
    const groupKey = `${category} - ${voice.gender}`;
    if (!voiceGroups[groupKey]) {
      voiceGroups[groupKey] = [];
    }
    voiceGroups[groupKey].push({ id, name: voice.name, language: voice.language, traits: voice.traits });
  }

  // Sort groups
  const sortedGroups = Object.keys(voiceGroups).sort();

  // Format group label
  const formatGroupLabel = (groupKey: string): string => {
    const [category, gender] = groupKey.split(" - ");
    const categoryMap: Record<string, string> = {
      af: "American Female",
      am: "American Male", 
      bf: "British Female",
      bm: "British Male",
    };
    return categoryMap[category] || `${gender} Voices (${category.toUpperCase()})`;
  };

  return (
    <div className="flex items-center gap-2 flex-1">
      <label htmlFor="voiceSelector" className="font-semibold whitespace-nowrap">
        Voice:
      </label>
      <select
        id="voiceSelector"
        value={selectedVoice}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || Object.keys(voices).length === 0}
        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-30 focus:border-primary
          disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-100"
      >
        {Object.keys(voices).length === 0 ? (
          <option>Loading voices...</option>
        ) : (
          sortedGroups.map((groupKey) => {
            const [category, gender] = groupKey.split(" - ");
            const isAfFemale = category === "af" && gender === "Female";
            
            return (
              <optgroup key={groupKey} label={formatGroupLabel(groupKey)}>
                {/* Insert Heart at top of AF Female group */}
                {isAfFemale && heartVoice && (
                  <option value={heartVoice.id}>
                    {heartVoice.traits ? `${heartVoice.traits} ` : ""}{heartVoice.name} ({heartVoice.language})
                  </option>
                )}
                {voiceGroups[groupKey]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.traits ? `${voice.traits} ` : ""}{voice.name} ({voice.language})
                    </option>
                  ))}
              </optgroup>
            );
          })
        )}
      </select>
    </div>
  );
}
