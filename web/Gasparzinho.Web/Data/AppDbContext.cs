using Gasparzinho.Web.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Gasparzinho.Web.Data;

/// <summary>
/// Mapeia as entidades para o schema MySQL que já existe em produção (tabelas e
/// colunas em snake_case), de modo que o banco atual continue válido.
/// </summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<SuperAdmin> SuperAdmins => Set<SuperAdmin>();
    public DbSet<WaSession> Sessions => Set<WaSession>();
    public DbSet<GroupSetting> GroupSettings => Set<GroupSetting>();
    public DbSet<ProfanityWord> ProfanityWords => Set<ProfanityWord>();
    public DbSet<CustomCommand> CustomCommands => Set<CustomCommand>();
    public DbSet<Ban> Bans => Set<Ban>();
    public DbSet<Warning> Warnings => Set<Warning>();
    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<MemberActivity> MemberActivities => Set<MemberActivity>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<ModerationSuggestion> ModerationSuggestions => Set<ModerationSuggestion>();
    public DbSet<SystemAiConfig> SystemAiConfigs => Set<SystemAiConfig>();
    public DbSet<TenantAiConfig> TenantAiConfigs => Set<TenantAiConfig>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Plan>(e =>
        {
            e.ToTable("plans");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.Name).HasColumnName("name").HasMaxLength(255);
            e.Property(x => x.Slug).HasColumnName("slug").HasMaxLength(100);
            e.Property(x => x.MaxSessions).HasColumnName("max_sessions");
            e.Property(x => x.MaxGroups).HasColumnName("max_groups");
            e.Property(x => x.MaxGroupsPerSession).HasColumnName("max_groups_per_session");
            e.Property(x => x.Features).HasColumnName("features").HasColumnType("text");
            e.Property(x => x.IsActive).HasColumnName("is_active");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => x.Slug).IsUnique();
        });

        b.Entity<Tenant>(e =>
        {
            e.ToTable("tenants");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.Name).HasColumnName("name").HasMaxLength(255);
            e.Property(x => x.PlanId).HasColumnName("plan_id").HasMaxLength(100);
            e.Property(x => x.PlanExpiresAt).HasColumnName("plan_expires_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        b.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.Username).HasColumnName("username").HasMaxLength(255);
            e.Property(x => x.Email).HasColumnName("email").HasMaxLength(255);
            e.Property(x => x.PasswordHash).HasColumnName("password_hash").HasMaxLength(255);
            e.Property(x => x.Role).HasColumnName("role").HasMaxLength(50);
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => new { x.TenantId, x.Username }).IsUnique();
            e.HasIndex(x => x.Email).IsUnique();
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<SuperAdmin>(e =>
        {
            e.ToTable("super_admins");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.Username).HasColumnName("username").HasMaxLength(100);
            e.Property(x => x.PasswordHash).HasColumnName("password_hash").HasMaxLength(255);
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => x.Username).IsUnique();
        });

        b.Entity<WaSession>(e =>
        {
            e.ToTable("sessions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.Name).HasColumnName("name").HasMaxLength(255);
            e.Property(x => x.Phone).HasColumnName("phone").HasMaxLength(50);
            e.Property(x => x.DisplayName).HasColumnName("display_name").HasMaxLength(255);
            e.Property(x => x.Status).HasColumnName("status").HasMaxLength(50);
            e.Property(x => x.QrCode).HasColumnName("qr_code").HasColumnType("mediumtext");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => x.TenantId);
        });

        b.Entity<GroupSetting>(e =>
        {
            e.ToTable("group_settings");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.SessionId).HasColumnName("session_id").HasMaxLength(36);
            e.Property(x => x.GroupId).HasColumnName("group_id").HasMaxLength(255);
            e.Property(x => x.GroupName).HasColumnName("group_name").HasMaxLength(255);
            e.Property(x => x.LockEnabled).HasColumnName("lock_enabled");
            e.Property(x => x.LockStart).HasColumnName("lock_start").HasMaxLength(10);
            e.Property(x => x.LockEnd).HasColumnName("lock_end").HasMaxLength(10);
            e.Property(x => x.LockDays).HasColumnName("lock_days").HasMaxLength(50);
            e.Property(x => x.LockReason).HasColumnName("lock_reason").HasMaxLength(500);
            e.Property(x => x.BanLinks).HasColumnName("ban_links");
            e.Property(x => x.BanProfanity).HasColumnName("ban_profanity");
            e.Property(x => x.BanNsfw).HasColumnName("ban_nsfw");
            e.Property(x => x.BanViewOnce).HasColumnName("ban_viewonce");
            e.Property(x => x.BanMedia).HasColumnName("ban_media");
            e.Property(x => x.AiEnabled).HasColumnName("ai_enabled");
            e.Property(x => x.IsManaged).HasColumnName("is_managed");
            e.Property(x => x.WarnChances).HasColumnName("warn_chances");
            e.Property(x => x.FloodLimit).HasColumnName("flood_limit");
            e.Property(x => x.FloodPeriodMin).HasColumnName("flood_period_min");
            e.Property(x => x.FloodCloseMin).HasColumnName("flood_close_min");
            e.Property(x => x.MsgWarn).HasColumnName("msg_warn").HasColumnType("text");
            e.Property(x => x.MsgBan).HasColumnName("msg_ban").HasColumnType("text");
            e.Property(x => x.WelcomeEnabled).HasColumnName("welcome_enabled");
            e.Property(x => x.WelcomeMessage).HasColumnName("welcome_message").HasColumnType("text");
            e.Property(x => x.ModerationMode).HasColumnName("moderation_mode").HasMaxLength(20);
            e.Property(x => x.InactivityEnabled).HasColumnName("inactivity_enabled");
            e.Property(x => x.InactivityDays).HasColumnName("inactivity_days");
            e.Property(x => x.InactivityReason).HasColumnName("inactivity_reason").HasColumnType("text");
            e.Property(x => x.InactivityAnnounce).HasColumnName("inactivity_announce");
            e.Property(x => x.InactivityLastRunAt).HasColumnName("inactivity_last_run_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => new { x.SessionId, x.GroupId }).IsUnique();
        });

        b.Entity<ProfanityWord>(e =>
        {
            e.ToTable("profanity_words");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.Word).HasColumnName("word").HasMaxLength(255);
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => new { x.TenantId, x.Word }).IsUnique();
        });

        b.Entity<CustomCommand>(e =>
        {
            e.ToTable("custom_commands");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.TriggerWord).HasColumnName("trigger_word").HasMaxLength(255);
            e.Property(x => x.Action).HasColumnName("action").HasMaxLength(50);
            e.Property(x => x.Description).HasColumnName("description").HasColumnType("text");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => new { x.TenantId, x.TriggerWord }).IsUnique();
        });

        b.Entity<Ban>(e =>
        {
            e.ToTable("bans");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.SessionId).HasColumnName("session_id").HasMaxLength(36);
            e.Property(x => x.GroupId).HasColumnName("group_id").HasMaxLength(255);
            e.Property(x => x.Phone).HasColumnName("phone").HasMaxLength(255);
            e.Property(x => x.Reason).HasColumnName("reason").HasColumnType("text");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => x.TenantId);
        });

        b.Entity<Warning>(e =>
        {
            e.ToTable("warnings");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.SessionId).HasColumnName("session_id").HasMaxLength(36);
            e.Property(x => x.GroupId).HasColumnName("group_id").HasMaxLength(255);
            e.Property(x => x.Phone).HasColumnName("phone").HasMaxLength(255);
            e.Property(x => x.Count).HasColumnName("count");
            e.Property(x => x.LastReason).HasColumnName("last_reason").HasColumnType("text");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.HasIndex(x => new { x.SessionId, x.GroupId, x.Phone }).IsUnique();
        });

        b.Entity<Contact>(e =>
        {
            e.ToTable("contacts");
            e.HasKey(x => new { x.TenantId, x.Jid });
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.Jid).HasColumnName("jid").HasMaxLength(255);
            e.Property(x => x.PushName).HasColumnName("push_name").HasMaxLength(255);
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        b.Entity<MemberActivity>(e =>
        {
            e.ToTable("member_activity");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.SessionId).HasColumnName("session_id").HasMaxLength(36);
            e.Property(x => x.GroupId).HasColumnName("group_id").HasMaxLength(255);
            e.Property(x => x.Jid).HasColumnName("jid").HasMaxLength(255);
            e.Property(x => x.LastMessageAt).HasColumnName("last_message_at");
            e.Property(x => x.FirstSeenAt).HasColumnName("first_seen_at");
            e.HasIndex(x => new { x.SessionId, x.GroupId, x.Jid }).IsUnique();
            e.HasIndex(x => new { x.SessionId, x.GroupId, x.LastMessageAt });
        });

        b.Entity<Notification>(e =>
        {
            e.ToTable("notifications");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.Kind).HasColumnName("kind").HasMaxLength(50);
            e.Property(x => x.Severity).HasColumnName("severity").HasMaxLength(20);
            e.Property(x => x.Title).HasColumnName("title").HasMaxLength(255);
            e.Property(x => x.Body).HasColumnName("body").HasColumnType("text");
            e.Property(x => x.Channel).HasColumnName("channel").HasMaxLength(50);
            e.Property(x => x.Metadata).HasColumnName("metadata").HasColumnType("text");
            e.Property(x => x.SentAt).HasColumnName("sent_at");
            e.Property(x => x.ReadAt).HasColumnName("read_at");
            e.HasIndex(x => new { x.TenantId, x.ReadAt });
            e.HasIndex(x => x.Kind);
        });

        b.Entity<ModerationSuggestion>(e =>
        {
            e.ToTable("moderation_suggestions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.SessionId).HasColumnName("session_id").HasMaxLength(36);
            e.Property(x => x.GroupId).HasColumnName("group_id").HasMaxLength(255);
            e.Property(x => x.GroupName).HasColumnName("group_name").HasMaxLength(255);
            e.Property(x => x.MessageId).HasColumnName("message_id").HasMaxLength(255);
            e.Property(x => x.SenderJid).HasColumnName("sender_jid").HasMaxLength(255);
            e.Property(x => x.SenderPhone).HasColumnName("sender_phone").HasMaxLength(50);
            e.Property(x => x.MessageText).HasColumnName("message_text").HasColumnType("text");
            e.Property(x => x.DetectedReason).HasColumnName("detected_reason").HasMaxLength(100);
            e.Property(x => x.SuggestedAction).HasColumnName("suggested_action").HasMaxLength(50);
            e.Property(x => x.ReplyTemplate).HasColumnName("reply_template").HasColumnType("text");
            e.Property(x => x.AiReason).HasColumnName("ai_reason").HasColumnType("text");
            e.Property(x => x.Confidence).HasColumnName("confidence");
            e.Property(x => x.PromptUsed).HasColumnName("prompt_used").HasColumnType("text");
            e.Property(x => x.Status).HasColumnName("status").HasMaxLength(20);
            e.Property(x => x.ReviewedBy).HasColumnName("reviewed_by").HasMaxLength(36);
            e.Property(x => x.ReviewedAt).HasColumnName("reviewed_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => new { x.TenantId, x.Status });
            e.HasIndex(x => new { x.SessionId, x.GroupId, x.Status });
            e.HasIndex(x => x.CreatedAt);
        });

        b.Entity<SystemAiConfig>(e =>
        {
            e.ToTable("system_ai_config");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.Provider).HasColumnName("provider").HasMaxLength(50);
            e.Property(x => x.Model).HasColumnName("model").HasMaxLength(100);
            e.Property(x => x.ApiKey).HasColumnName("api_key").HasColumnType("text");
            e.Property(x => x.Enabled).HasColumnName("enabled");
            e.Property(x => x.ProfanityPrompt).HasColumnName("profanity_prompt").HasColumnType("text");
            e.Property(x => x.NsfwPrompt).HasColumnName("nsfw_prompt").HasColumnType("text");
            e.Property(x => x.CreditsExhausted).HasColumnName("credits_exhausted");
            e.Property(x => x.DegradedMode).HasColumnName("degraded_mode");
            e.Property(x => x.DegradedSince).HasColumnName("degraded_since");
            e.Property(x => x.DegradedReason).HasColumnName("degraded_reason").HasMaxLength(100);
            e.Property(x => x.ExpectedRecoveryAt).HasColumnName("expected_recovery_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        b.Entity<TenantAiConfig>(e =>
        {
            e.ToTable("ai_configs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id").HasMaxLength(36);
            e.Property(x => x.TenantId).HasColumnName("tenant_id").HasMaxLength(36);
            e.Property(x => x.Enabled).HasColumnName("enabled");
            e.Property(x => x.ApiKey).HasColumnName("api_key").HasColumnType("text");
            e.Property(x => x.Provider).HasColumnName("provider").HasMaxLength(50);
            e.Property(x => x.Model).HasColumnName("model").HasMaxLength(100);
            e.Property(x => x.SystemPrompt).HasColumnName("system_prompt").HasColumnType("text");
            e.Property(x => x.TriggerMode).HasColumnName("trigger_mode").HasMaxLength(50);
            e.Property(x => x.TriggerKeyword).HasColumnName("trigger_keyword").HasMaxLength(100);
            e.Property(x => x.ModerationEnabled).HasColumnName("moderation_enabled");
            e.Property(x => x.ModerationProvider).HasColumnName("moderation_provider").HasMaxLength(50);
            e.Property(x => x.ModerationApiKey).HasColumnName("moderation_api_key").HasColumnType("text");
            e.Property(x => x.ModerationModel).HasColumnName("moderation_model").HasMaxLength(100);
            e.Property(x => x.ProfanityPrompt).HasColumnName("profanity_prompt").HasColumnType("text");
            e.Property(x => x.NsfwPrompt).HasColumnName("nsfw_prompt").HasColumnType("text");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.HasIndex(x => x.TenantId).IsUnique();
        });
    }
}
