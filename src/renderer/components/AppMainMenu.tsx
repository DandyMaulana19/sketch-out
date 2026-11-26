import { MainMenu, languages } from "@excalidraw/excalidraw";
import type { ReactNode } from "react";
import { ClockIcon, FilePlusIcon, FolderIcon, FolderOpenIcon, SaveIcon, SparkIcon } from "./icons";
import { shortcutLabel } from "../../shared/paths";

const IS_MAC = /Mac/i.test(navigator.platform);
export const sc = (keys: string) => shortcutLabel(keys, IS_MAC);

export interface FileActions {
  newDoc(): void;
  openLocal(): void;
  saveAs(): void;
  openRecent(path: string): void;
  openFolder(): void;
  openRecentFolder(dir: string): void;
  connectAi(): void;
}

export const fileName = (p: string) => p.split(/[\\/]/).pop()!.replace(/\.excalidraw$/i, "");
export const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

interface Props {
  actions: FileActions;
  recent: string[];
  recentFolders: string[];
  extra?: ReactNode;
  langCode: string;
  onLangChange(code: string): void;
}

export function AppMainMenu({ actions, recent, recentFolders, extra, langCode, onLangChange }: Props) {
  return (
    <MainMenu>
      <MainMenu.Item icon={FilePlusIcon} onSelect={actions.newDoc} shortcut={sc("Mod+N")}>Baru</MainMenu.Item>
      <MainMenu.Item icon={FolderOpenIcon} onSelect={actions.openLocal} shortcut={sc("Mod+O")}>Buka file lokal…</MainMenu.Item>
      <MainMenu.Item icon={FolderIcon} onSelect={actions.openFolder} shortcut={sc("Mod+Shift+O")}>Buka folder…</MainMenu.Item>
      <MainMenu.Item icon={SaveIcon} onSelect={actions.saveAs} shortcut={sc("Mod+Shift+S")}>Simpan sebagai…</MainMenu.Item>
      {extra}
      <MainMenu.Item icon={SparkIcon} onSelect={actions.connectAi}>Hubungkan ke AI…</MainMenu.Item>
      {recent.length > 0 && (
        <MainMenu.Group title="File terbaru">
          {recent.slice(0, 5).map((p) => (
            <MainMenu.Item key={p} icon={ClockIcon} onSelect={() => actions.openRecent(p)} title={p}>
              {fileName(p)}
            </MainMenu.Item>
          ))}
        </MainMenu.Group>
      )}
      {recentFolders.length > 0 && (
        <MainMenu.Group title="Folder terbaru">
          {recentFolders.slice(0, 5).map((d) => (
            <MainMenu.Item key={d} icon={FolderIcon} onSelect={() => actions.openRecentFolder(d)} title={d}>
              {folderName(d)}
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
