// AGPL-3.0-only. Launcher for the isolated local Windows build; no elevation.
using System;
using System.IO;
using System.Diagnostics;
using System.Net.Sockets;
using System.Windows.Forms;

internal static class LanceurRetouche
{
    [STAThread]
    private static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string executable = Path.Combine(root, "application-chat-autonome", "Helix.exe");
        try
        {
            File.WriteAllText(Path.Combine(root, "lancement.log"), DateTime.Now.ToString("s") + " lancement\r\n");
            Application.EnableVisualStyles();
            if (!File.Exists(executable)) throw new Exception("Le dossier application est absent. Conservez tout le dossier Helix-Windows.");
            if (!Directory.Exists(Path.Combine(root, "modeles"))) throw new Exception("Le dossier des modèles locaux est absent.");
            int port = 8795;
            for (; port <= 8805; port++)
            {
                try { using (TcpClient test = new TcpClient()) { test.Connect("127.0.0.1", port); } }
                catch (SocketException) { break; }
            }
            if (port > 8805)
            {
                MessageBox.Show("Les ports locaux 8795 à 8805 sont occupés. Fermez une autre version de retouche, puis réessayez.", "Helix — retouche locale", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            Directory.CreateDirectory(Path.Combine(root, "donnees"));
            Directory.CreateDirectory(Path.Combine(root, "profil"));
            ProcessStartInfo p = new ProcessStartInfo(executable);
            p.UseShellExecute = false;
            p.CreateNoWindow = true;
            p.WorkingDirectory = root;
            p.EnvironmentVariables["HELIX_DATA_DIR"] = Path.Combine(root, "donnees");
            p.EnvironmentVariables["HELIX_IMAGES_DIR"] = Path.Combine(root, "modeles");
            p.EnvironmentVariables["HELIX_TOKEN_FILE"] = Path.Combine(root, "donnees", "instance-token");
            p.EnvironmentVariables["HELIX_CONFIG"] = Path.Combine(root, "config.local.json");
            p.EnvironmentVariables["HELIX_PROFIL_ESSAI"] = Path.Combine(root, "profil");
            p.EnvironmentVariables["HELIX_GATEWAY_HOST"] = "127.0.0.1";
            p.EnvironmentVariables["HELIX_GATEWAY_PORT"] = port.ToString();
            // Avoid an official update overwriting this custom source build.
            p.EnvironmentVariables["HELIX_SANS_MISE_A_JOUR"] = "1";
            Process enfant = Process.Start(p);
            File.AppendAllText(Path.Combine(root, "lancement.log"), "Passerelle locale attendue sur le port " + port + ". Processus " + enfant.Id + ".\r\n");
        }
        catch (Exception erreur)
        {
            try { File.AppendAllText(Path.Combine(root, "lancement.log"), erreur.ToString()); } catch { }
            MessageBox.Show(erreur.Message, "Helix — lancement impossible", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
