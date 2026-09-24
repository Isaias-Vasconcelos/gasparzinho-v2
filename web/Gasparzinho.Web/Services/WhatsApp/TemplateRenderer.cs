using System.Text.RegularExpressions;

namespace Gasparzinho.Web.Services.WhatsApp;

/// <summary>Variáveis aceitas nas mensagens personalizadas de advertência e banimento.</summary>
public record TemplateVars
{
    public string? Motivo { get; init; }
    public string? Grupo { get; init; }
    public string? Usuario { get; init; }
    public int? Contagem { get; init; }
    public int? Max { get; init; }
    public int? Restantes { get; init; }
    /// <summary>Dias de inatividade que motivaram a remoção.</summary>
    public int? Dias { get; init; }
}

/// <summary>Substitui {motivo}, {grupo}, {usuario}, {contagem}, {max}, {restantes} e {dias}.</summary>
public static partial class TemplateRenderer
{
    public static string Apply(string template, TemplateVars vars)
    {
        if (string.IsNullOrEmpty(template)) return "";

        return PlaceholderRegex().Replace(template, match =>
        {
            var name = match.Groups[1].Value.ToLowerInvariant();
            return name switch
            {
                "motivo"    => vars.Motivo ?? "",
                "grupo"     => vars.Grupo ?? "",
                "usuario"   => vars.Usuario ?? "",
                "contagem"  => vars.Contagem?.ToString() ?? "",
                "max"       => vars.Max?.ToString() ?? "",
                "restantes" => vars.Restantes?.ToString() ?? "",
                "dias"      => vars.Dias?.ToString() ?? "",
                // Placeholder desconhecido fica literal, para o usuário perceber o erro.
                _ => match.Value,
            };
        });
    }

    [GeneratedRegex(@"\{(\w+)\}")]
    private static partial Regex PlaceholderRegex();
}
