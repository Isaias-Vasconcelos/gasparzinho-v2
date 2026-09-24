using System.Text.Json.Serialization;

namespace Gasparzinho.Web.Services.WhatsApp;

/// <summary>
/// Evento de mensagem enviado pela bridge Node. Já vem normalizado — a bridge
/// resolve os detalhes do protocolo (view-once, legendas, stubs de entrada).
/// </summary>
public class IncomingMessage
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = "";

    [JsonPropertyName("groupId")]
    public string GroupId { get; set; } = "";

    [JsonPropertyName("messageId")]
    public string? MessageId { get; set; }

    /// <summary>JID do autor.</summary>
    [JsonPropertyName("senderJid")]
    public string SenderJid { get; set; } = "";

    [JsonPropertyName("pushName")]
    public string? PushName { get; set; }

    /// <summary>Texto ou legenda da mídia.</summary>
    [JsonPropertyName("text")]
    public string? Text { get; set; }

    /// <summary>O autor é administrador do grupo.</summary>
    [JsonPropertyName("isAdmin")]
    public bool IsAdmin { get; set; }

    [JsonPropertyName("fromMe")]
    public bool FromMe { get; set; }

    /// <summary>none | image | video | sticker</summary>
    [JsonPropertyName("mediaType")]
    public string MediaType { get; set; } = "none";

    [JsonPropertyName("isViewOnce")]
    public bool IsViewOnce { get; set; }

    /// <summary>JIDs mencionados na mensagem — usado pelos comandos de admin.</summary>
    [JsonPropertyName("mentions")]
    public List<string> Mentions { get; set; } = [];

    public bool HasMedia => MediaType is "image" or "video" or "sticker";
}

/// <summary>Notificação de novos membros — dispara a saudação.</summary>
public class ParticipantsAdded
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = "";

    [JsonPropertyName("groupId")]
    public string GroupId { get; set; } = "";

    [JsonPropertyName("participants")]
    public List<string> Participants { get; set; } = [];
}
