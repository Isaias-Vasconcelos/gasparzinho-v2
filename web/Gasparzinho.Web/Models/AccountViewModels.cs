using System.ComponentModel.DataAnnotations;

namespace Gasparzinho.Web.Models;

public class LoginViewModel
{
    [Required(ErrorMessage = "Informe o usuário.")]
    [Display(Name = "Usuário")]
    public string Username { get; set; } = "";

    [Required(ErrorMessage = "Informe a senha.")]
    [DataType(DataType.Password)]
    [Display(Name = "Senha")]
    public string Password { get; set; } = "";

    [Display(Name = "Manter conectado")]
    public bool RememberMe { get; set; } = true;

    public string? ReturnUrl { get; set; }
}
