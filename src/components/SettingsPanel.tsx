import { useEffect, useRef, useState } from 'react';
import type { OutlineSettingsController } from '../hooks/useOutlineSettings';
import { normalizeHexColor, parseOutlineFontSize, type AccentPreset, type ThemeMode } from '../lib/outlineSettings';

type SettingsPanelProps = {
    settings: OutlineSettingsController;
    onBack: () => void;
};

const themeOptions: { label: string; value: ThemeMode }[] = [
    { label: 'System', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
];

const accentOptions: { label: string; value: AccentPreset }[] = [
    { label: 'Blue', value: 'blue' },
    { label: 'Green', value: 'green' },
    { label: 'Yellow', value: 'yellow' },
    { label: 'Pink', value: 'pink' },
    { label: 'Orange', value: 'orange' },
    { label: 'Purple', value: 'purple' },
];

type HexColorFieldProps = {
    label: string;
    inputLabel: string;
    value: string | null;
    onChange: (value: string | null) => void;
};

function HexColorField({ label, inputLabel, value, onChange }: HexColorFieldProps) {
    const [draft, setDraft] = useState(value ?? '');
    const normalizedDraft = normalizeHexColor(draft);
    const invalid = draft.trim().length > 0 && !normalizedDraft;

    useEffect(() => {
        setDraft(value ?? '');
    }, [value]);

    const commit = () => {
        if (!draft.trim()) {
            onChange(null);
            return;
        }
        if (!normalizedDraft) return;
        setDraft(normalizedDraft);
        onChange(normalizedDraft);
    };

    return (
        <div className="scroll-pro-setting-field">
            <div className="scroll-pro-setting-row">
                <span className="scroll-pro-setting-label">{label}</span>
                <div className="scroll-pro-setting-control">
                    <div className={`scroll-pro-hex-input-wrap ${invalid ? 'is-error' : ''}`}>
                        <span
                            className="scroll-pro-hex-preview"
                            style={{ backgroundColor: normalizedDraft ?? value ?? 'transparent' }}
                            aria-hidden="true"
                        />
                        <input
                            type="text"
                            aria-label={inputLabel}
                            aria-invalid={invalid || undefined}
                            value={draft}
                            placeholder="#RRGGBB"
                            maxLength={7}
                            spellCheck={false}
                            autoCapitalize="off"
                            onChange={event => {
                                const next = event.target.value;
                                setDraft(next);
                                if (!next.trim()) onChange(null);
                                else if (/^#[\da-f]{6}$/i.test(next.trim())) onChange(next);
                            }}
                            onBlur={commit}
                            onKeyDown={event => {
                                if (event.key !== 'Enter') return;
                                event.preventDefault();
                                commit();
                            }}
                        />
                        {draft && (
                            <button
                                type="button"
                                className="scroll-pro-field-clear"
                                aria-label={`Clear ${label}`}
                                title="Clear"
                                onClick={() => {
                                    setDraft('');
                                    onChange(null);
                                }}
                            >
                                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {invalid && <span className="scroll-pro-setting-error">Invalid hex color</span>}
        </div>
    );
}

function PixelSizeField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
    const [draft, setDraft] = useState(String(value));

    useEffect(() => {
        setDraft(String(value));
    }, [value]);

    const handleIncrement = () => {
        if (value < 24) {
            onChange(value + 1);
        }
    };

    const handleDecrement = () => {
        if (value > 10) {
            onChange(value - 1);
        }
    };

    return (
        <div className="scroll-pro-setting-row">
            <span className="scroll-pro-setting-label">Text size</span>
            <div className="scroll-pro-setting-control">
                <div className="scroll-pro-pixel-stepper">
                    <button
                        type="button"
                        className="scroll-pro-stepper-btn"
                        onClick={handleDecrement}
                        disabled={value <= 10}
                        aria-label="Decrease text size"
                    >
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                    <input
                        type="number"
                        aria-label="Outline text size"
                        min="10"
                        max="24"
                        step="1"
                        value={draft}
                        onChange={event => {
                            const next = event.target.value;
                            setDraft(next);
                            const parsed = parseOutlineFontSize(Number(next));
                            if (parsed !== null) onChange(parsed);
                        }}
                        onBlur={() => setDraft(String(value))}
                    />
                    <span className="scroll-pro-pixel-unit" aria-hidden="true">px</span>
                    <button
                        type="button"
                        className="scroll-pro-stepper-btn"
                        onClick={handleIncrement}
                        disabled={value >= 24}
                        aria-label="Increase text size"
                    >
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SettingsPanel({ settings, onBack }: SettingsPanelProps) {
    const backButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        backButtonRef.current?.focus();
    }, []);

    return (
        <div
            className="scroll-pro-settings-view"
            onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                onBack();
            }}
        >
            <div className="scroll-pro-settings-header">
                <button ref={backButtonRef} type="button" className="scroll-pro-settings-back" aria-label="Back to outline" onClick={onBack}>
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <h2>Settings</h2>
            </div>

            <div className="scroll-pro-settings-content">
                <section className="scroll-pro-settings-section" aria-labelledby="scroll-pro-appearance-heading">
                    <h3 id="scroll-pro-appearance-heading" className="scroll-pro-settings-section-title">Appearance</h3>

                    <div className="scroll-pro-setting-row">
                        <span className="scroll-pro-setting-label">Display mode</span>
                        <div className="scroll-pro-setting-control">
                            <div className="scroll-pro-setting-options" role="group" aria-label="Display mode">
                                {themeOptions.map(option => (
                                    <button key={option.value} type="button" aria-pressed={settings.themeMode === option.value} onClick={() => settings.updateThemeMode(option.value)}>{option.label}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="scroll-pro-setting-row">
                        <span className="scroll-pro-setting-label">Theme color</span>
                        <div className="scroll-pro-setting-control">
                            <div className="scroll-pro-accent-options" role="group" aria-label="Theme color">
                                {accentOptions.map(option => (
                                    <button key={option.value} type="button" title={option.label} aria-label={option.label} data-accent-option={option.value} aria-pressed={!settings.customAccent && settings.accentPreset === option.value} onClick={() => settings.updateAccentPreset(option.value)}>
                                        <span className="scroll-pro-accent-swatch" aria-hidden="true" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <HexColorField
                        label="Custom theme color"
                        inputLabel="Custom theme color hex"
                        value={settings.customAccent}
                        onChange={settings.updateCustomAccent}
                    />

                    <HexColorField
                        label="Background color"
                        inputLabel="Background color hex"
                        value={settings.customBackground}
                        onChange={settings.updateCustomBackground}
                    />
                </section>

                <div className="scroll-pro-settings-divider" aria-hidden="true" />

                <section className="scroll-pro-settings-section" aria-labelledby="scroll-pro-outline-heading">
                    <h3 id="scroll-pro-outline-heading" className="scroll-pro-settings-section-title">Outline</h3>

                    <PixelSizeField value={settings.fontSize} onChange={settings.updateFontSize} />

                    <div className="scroll-pro-setting-row">
                        <span className="scroll-pro-setting-label">Heading depth</span>
                        <div className="scroll-pro-setting-control">
                            <div className="scroll-pro-setting-select">
                                <select aria-label="Heading depth" value={settings.depth} onChange={event => settings.updateDepth(Number(event.target.value))}>
                                    {[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>H1–H{level}</option>)}
                                </select>
                                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                            </div>
                        </div>
                    </div>

                    <div className="scroll-pro-setting-row">
                        <span className="scroll-pro-setting-label">Width</span>
                        <div className="scroll-pro-setting-control">
                            <div className="scroll-pro-setting-options" role="group" aria-label="Outline width">
                                {[{ label: 'Narrow', value: 320 }, { label: 'Standard', value: 420 }, { label: 'Wide', value: 640 }].map(option => (
                                    <button key={option.value} type="button" aria-pressed={settings.width === option.value} onClick={() => settings.updateWidth(option.value)}>{option.label}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
