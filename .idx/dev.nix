# Firebase Studio workspace for the native Expo application.
{ pkgs, ... }: {
  channel = "stable-24.11";
  packages = [ pkgs.nodejs_22 ];
  env = {};
  idx = {
    extensions = [ "google.gemini-cli-vscode-ide-companion" ];
    workspace = {
      onCreate = {
        mobile-npm-install = "cd apps/mobile && npm install --no-audit --no-progress";
        default.openFiles = [ "apps/mobile/App.tsx" "supabase/schema.sql" ];
      };
    };
    previews = {
      enable = false;
    };
  };
}
