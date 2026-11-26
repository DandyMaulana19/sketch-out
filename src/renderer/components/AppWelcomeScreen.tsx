import { WelcomeScreen } from "@excalidraw/excalidraw";
import type { ReactNode } from "react";
import { ClockIcon, FolderIcon, FolderOpenIcon } from "./icons";
import { fileName, folderName, sc, type FileActions } from "./AppMainMenu";

export function AppWelcomeScreen({ actions, recent, recentFolders, extra }: { actions: FileActions; recent: string[]; recentFolders: string[]; extra?: ReactNode }) {
  return (
    <WelcomeScreen>
      <WelcomeScreen.Hints.MenuHint />
      <WelcomeScreen.Hints.ToolbarHint />
      <WelcomeScreen.Hints.HelpHint />
      <WelcomeScreen.Center>
        <WelcomeScreen.Center.Logo>
          <div className="so-logo">Sketch Out</div>
        </WelcomeScreen.Center.Logo>
        <WelcomeScreen.Center.Heading>Gambarmu tersimpan di perangkat ini atau di Google Drive.</WelcomeScreen.Center.Heading>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItem onSelect={actions.openLocal} shortcut={sc("Mod+O")} icon={FolderOpenIcon}>
            Buka file lokal…
          </WelcomeScreen.Center.MenuItem>
          <WelcomeScreen.Center.MenuItem onSelect={actions.openFolder} shortcut={sc("Mod+Shift+O")} icon={FolderIcon}>
            Buka folder…
          </WelcomeScreen.Center.MenuItem>
          {extra}
          {recentFolders.slice(0, 2).map((d) => (
            <WelcomeScreen.Center.MenuItem key={d} onSelect={() => actions.openRecentFolder(d)} icon={FolderIcon} shortcut={null}>
              {folderName(d)}
            </WelcomeScreen.Center.MenuItem>
          ))}
          {recent.slice(0, 3).map((p) => (
            <WelcomeScreen.Center.MenuItem key={p} onSelect={() => actions.openRecent(p)} icon={ClockIcon} shortcut={null}>
              {fileName(p)}
            </WelcomeScreen.Center.MenuItem>
          ))}
          <WelcomeScreen.Center.MenuItemHelp />
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  );
}
