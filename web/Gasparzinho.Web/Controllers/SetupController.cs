using System.Security.Cryptography;
using System.Text;
using Gasparzinho.Web.Data;
using Gasparzinho.Web.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Gasparzinho.Web.Controllers;

/// <summary>
/// Primeira execução: o administrador escolhe entre SQLite e MySQL. Só existe
/// enquanto nenhum banco foi escolhido; depois a troca é feita pelo painel do
/// superadmin, e esta tela passa a apenas redirecionar.
/// </summary>
[AllowAnonymous]
public class SetupController(
    DatabaseSettingsStore store,
    DatabaseSwitcher switcher,
    IConfiguration config,
    ILogger<SetupController> logger) : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        if (store.IsConfigured) return RedirectToAction("Login", "Super");
        return View(NewModel());
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Index(SetupViewModel model, CancellationToken ct)
    {
        // Configurado enquanto a tela estava aberta: não deixamos a primeira
        // execução virar uma porta para trocar o banco sem login.
        if (store.IsConfigured) return RedirectToAction("Login", "Super");

        FillDisplay(model);
        if (!ModelState.IsValid) return View(model);

        var (username, password) = DbInitializer.ConfiguredSuperAdmin(config);
        if (!SecretEquals(model.Username, username) || !SecretEquals(model.Password, password))
        {
            logger.LogWarning("Configuração inicial recusada para {Username}", model.Username);
            ModelState.AddModelError(string.Empty, "Usuário ou senha do superadmin inválidos.");
            return View(model);
        }

        // Em branco, vale a string que já estava em appsettings.json.
        var connectionString = model.Provider == DatabaseProviders.MySql
            ? (string.IsNullOrWhiteSpace(model.ConnectionString)
                ? config.GetConnectionString("Default")
                : model.ConnectionString)
            : null;

        try
        {
            await switcher.ApplyAsync(model.Provider, connectionString, copyCurrentData: false, ct);
        }
        catch (DatabaseSetupException ex)
        {
            ModelState.AddModelError(string.Empty, ex.Message);
            return View(model);
        }

        TempData["Success"] =
            $"Banco {DatabaseProviders.Label(model.Provider)} configurado. Entre com o superadmin.";
        return RedirectToAction("Login", "Super");
    }

    private SetupViewModel NewModel()
    {
        var model = new SetupViewModel();
        FillDisplay(model);
        return model;
    }

    private void FillDisplay(SetupViewModel model)
    {
        model.SqlitePath = store.SqlitePath;
        model.HasConfiguredMySql = !string.IsNullOrWhiteSpace(config.GetConnectionString("Default"));
    }

    /// <summary>Comparação em tempo constante, para não vazar a senha por timing.</summary>
    private static bool SecretEquals(string provided, string expected) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(provided), Encoding.UTF8.GetBytes(expected));
}
