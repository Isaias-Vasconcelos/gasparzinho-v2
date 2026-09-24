using Gasparzinho.Web.Data;
using Gasparzinho.Web.Services;
using Gasparzinho.Web.Services.Ai;
using Gasparzinho.Web.Services.Auth;
using Gasparzinho.Web.Services.Moderation;
using Gasparzinho.Web.Services.WhatsApp;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ── Banco ───────────────────────────────────────────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException(
        "ConnectionStrings:Default não configurada (appsettings.json).");

// A versão pode ser fixada em Database:ServerVersion (ex: "8.0.36"). Sem isso,
// é detectada na partida — o que exige o MySQL no ar nesse momento.
var configuredVersion = builder.Configuration["Database:ServerVersion"];
var serverVersion = string.IsNullOrWhiteSpace(configuredVersion)
    ? ServerVersion.AutoDetect(connectionString)
    : ServerVersion.Parse(configuredVersion);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseMySql(connectionString, serverVersion));

// ── Autenticação: cliente e superadmin em cookies separados ─────────────────
builder.Services
    .AddAuthentication(AuthSchemes.Tenant)
    .AddCookie(AuthSchemes.Tenant, options =>
    {
        options.Cookie.Name = "gz_tenant";
        options.LoginPath = "/Account/Login";
        options.LogoutPath = "/Account/Logout";
        options.AccessDeniedPath = "/Account/Login";
        options.ExpireTimeSpan = TimeSpan.FromDays(7);
        options.SlidingExpiration = true;
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
    })
    .AddCookie(AuthSchemes.Super, options =>
    {
        options.Cookie.Name = "gz_super";
        options.LoginPath = "/Super/Login";
        options.LogoutPath = "/Super/Logout";
        options.AccessDeniedPath = "/Super/Login";
        options.ExpireTimeSpan = TimeSpan.FromHours(12);
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("SuperAdmin", policy => policy
        .AddAuthenticationSchemes(AuthSchemes.Super)
        .RequireAuthenticatedUser());

    options.AddPolicy("TenantAdmin", policy => policy
        .AddAuthenticationSchemes(AuthSchemes.Tenant)
        .RequireAuthenticatedUser()
        .RequireRole("admin"));
});

// ── HTTP clients ────────────────────────────────────────────────────────────
builder.Services.AddHttpClient("ai", client =>
{
    // Análise de imagem pode ser lenta; 2 min cobre o pior caso.
    client.Timeout = TimeSpan.FromMinutes(2);
});

var bridgeUrl = builder.Configuration["Bridge:BaseUrl"] ?? "http://localhost:3002/";
builder.Services.AddHttpClient("bridge", client =>
{
    client.BaseAddress = new Uri(bridgeUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(60);

    var token = builder.Configuration["Bridge:Token"];
    if (!string.IsNullOrWhiteSpace(token))
        client.DefaultRequestHeaders.Add("X-Bridge-Token", token);
});

// ── Serviços da aplicação ───────────────────────────────────────────────────
builder.Services.AddScoped<AiClient>();
builder.Services.AddScoped<AiConfigResolver>();
builder.Services.AddScoped<ModerationService>();
builder.Services.AddScoped<PlanLimitService>();
builder.Services.AddScoped<WhatsAppBridgeClient>();
builder.Services.AddScoped<WarningService>();
builder.Services.AddScoped<InactivityService>();
builder.Services.AddScoped<MessagePipeline>();

// Contagem do anti-flood é estado compartilhado entre requisições.
builder.Services.AddSingleton<FloodTracker>();

// Eventos da bridge são processados fora do ciclo da requisição.
builder.Services.AddSingleton<BridgeEventQueue>();
builder.Services.AddHostedService<BridgeEventWorker>();

// Fecha e reabre grupos nos horários configurados.
builder.Services.AddHostedService<ScheduledLockService>();

// Remove participantes que passaram do prazo de inatividade.
builder.Services.AddHostedService<InactivitySweepService>();

builder.Services.AddControllersWithViews(options =>
{
    // Contadores do menu lateral, em todas as páginas do cliente.
    options.Filters.Add<SidebarBadgeFilter>();
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

try
{
    await DbInitializer.InitializeAsync(app.Services);
}
catch (Exception ex)
{
    // Sem banco não há aplicação — mas o erro precisa ser legível, não um stack cru.
    app.Logger.LogCritical(
        "Falha ao preparar o banco de dados: {Message}\n" +
        "Verifique ConnectionStrings:Default e se o MySQL está acessível.", ex.Message);
    return 1;
}

app.Run();
return 0;
