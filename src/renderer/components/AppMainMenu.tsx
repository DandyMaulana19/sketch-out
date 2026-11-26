import { MainMenu, languages } from "@excalidraw/excalidraw";
import type { ReactNode } from "react";
import { ClockIcon, FilePlusIcon, FolderOpenIcon, SaveIcon } from "./icons";

export interface FileActions {
  newDoc(): void;
  openLocal(): void;
  saveAs(): void;
  openRecent(path: string): void;
}

export const fileName = (p: string) => p.split(/[\\/]/).pop()!.replace(/\.excalidraw$/i, "");

interface Props {
  actions: FileActions;
  recent: string[];
  extra?: ReactNode;
  langCode: string;
  onLangChange(code: string): void;
}

export function AppMainMenu({ actions, recent, extra, langCode, onLangChange }: Props) {
  return (
    <MainMenu>
      <MainMenu.Item icon={FilePlusIcon} onSelect={actions.newDoc} shortcut="⌘N">Baru</MainMenu.Item>
      <MainMenu.Item icon={FolderOpenIcon} onSelect={actions.openLocal} shortcut="⌘O">Buka file lokal…</MainMenu.Item>
      <MainMenu.Item icon={SaveIcon} onSelect={actions.saveAs} shortcut="⌘⇧S">Simpan sebagai…</MainMenu.Item>
      {extra}
      {recent.length > 0 && (
        <MainMenu.Group title="File terbaru">
          {recent.slice(0, 5).map((p) => (
            <MainMenu.Item key={p} icon={ClockIcon} onSelect={() => actions.openRecent(p)} title={p}>
              {fileName(p)}
            </MainMenu.Item>
          ))}
        </MainMenu.Group>
      )}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.DefaultItems.CommandPalette />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ToggleTheme />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
      <MainMenu.ItemCustom>
        <select className="so-lang dropdown-select" aria-label="Bahasa" value={langCode} onChange={(e) => onLangChange(e.target.value)}>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </MainMenu.ItemCustom>
    </MainMenu>
  );
}
