import { WelcomeScreen } from "@excalidraw/excalidraw";
import type { ReactNode } from "react";
import { ClockIcon, FolderOpenIcon } from "./icons";
import { fileName, type FileActions } from "./AppMainMenu";

export function AppWelcomeScreen({ actions, recent, extra }: { actions: FileActions; recent: string[]; extra?: ReactNode }) {
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
          <WelcomeScreen.Center.MenuItem onSelect={actions.openLocal} shortcut="⌘O" icon={FolderOpenIcon}>
            Buka file lokal…
          </WelcomeScreen.Center.MenuItem>
          {extra}
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
