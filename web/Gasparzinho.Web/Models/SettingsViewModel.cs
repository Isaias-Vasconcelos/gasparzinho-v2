using Gasparzinho.Web.Data.Entities;

namespace Gasparzinho.Web.Models;

public class SettingsViewModel
{
    public List<ProfanityWord> Words { get; set; } = [];
    public List<CustomCommand> Commands { get; set; } = [];

    /// <summary>Ações que a bridge sabe executar num comando de administrador.</summary>
    public static readonly (string Value, string Label)[] Actions =
    [
        ("remove", "Remover do grupo"),
        ("ban", "Remover e registrar banimento"),
        ("promote", "Promover a administrador"),
        ("demote", "Rebaixar de administrador"),
    ];

    public static string ActionLabel(string action) =>
        Actions.FirstOrDefault(a => a.Value == action).Label ?? action;
}
