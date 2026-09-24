using System.Globalization;
using System.Text;

namespace Gasparzinho.Web.Services.Moderation;

/// <summary>
/// Normalização das palavras da lista negra. O índice único
/// <c>uq_tenant_word</c> usa uma collation do MySQL que ignora acento e caixa
/// — "cu", "cú" e "CU" são a mesma chave lá. A aplicação precisa comparar do
/// mesmo jeito, senão a checagem de duplicidade passa e o INSERT estoura.
/// </summary>
public static class ProfanityText
{
    /// <summary>Minúsculas e sem acento: a mesma chave que o MySQL enxerga.</summary>
    public static string Key(string value)
    {
        var decomposed = value.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);

        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }

        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
}
