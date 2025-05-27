#!/usr/bin/env node

import {
  Client,
  GatewayIntentBits,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Discord bot setup
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN environment variable is required");
}

// Initialize Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildModeration,
  ],
});

// Store Discord client reference
let discordClient = null;

client.once("ready", () => {
  discordClient = client;
  console.log(`Logged in as ${client.user.tag}`);
});

// Helper function to ensure Discord client is ready
function requireDiscordClient() {
  if (!discordClient) {
    throw new Error("Discord client not ready");
  }
  return discordClient;
}

// Helper function to find a guild by name or ID
async function findGuild(guildIdentifier) {
  const client = requireDiscordClient();

  if (!guildIdentifier) {
    // If no guild specified and bot is only in one guild, use that
    if (client.guilds.cache.size === 1) {
      return client.guilds.cache.first();
    }
    // List available guilds
    const guildList = Array.from(client.guilds.cache.values())
      .map((g) => `"${g.name}"`)
      .join(", ");
    throw new Error(
      `I'm in multiple Discord servers! Please tell me which one you want to use. Available servers: ${guildList}`
    );
  }

  // Try to fetch by ID first
  try {
    const guild = await client.guilds.fetch(guildIdentifier);
    if (guild) return guild;
  } catch {
    // If ID fetch fails, search by name
    const guilds = client.guilds.cache.filter(
      (g) => g.name.toLowerCase() === guildIdentifier.toLowerCase()
    );

    if (guilds.size === 0) {
      const availableGuilds = Array.from(client.guilds.cache.values())
        .map((g) => `"${g.name}"`)
        .join(", ");
      throw new Error(
        `I can't find a server called "${guildIdentifier}". Here are the servers I'm in: ${availableGuilds}`
      );
    }
    if (guilds.size > 1) {
      const guildList = guilds.map((g) => `${g.name} (ID: ${g.id})`).join(", ");
      throw new Error(
        `Multiple servers found with name "${guildIdentifier}": ${guildList}. Please specify the server ID.`
      );
    }
    return guilds.first();
  }
  throw new Error(`Server "${guildIdentifier}" not found`);
}

// Helper function to find a channel by name or ID within a specific guild (includes threads)
async function findChannel(channelIdentifier, guildIdentifier) {
  const client = requireDiscordClient();

  // If guildIdentifier is provided, find within that guild
  if (guildIdentifier) {
    const guild = await findGuild(guildIdentifier);

    // First try to fetch by ID
    try {
      const channel = await client.channels.fetch(channelIdentifier);
      if (
        channel &&
        channel.guild &&
        channel.guild.id === guild.id &&
        channel.isTextBased()
      ) {
        return channel;
      }
    } catch {
      // If fetching by ID fails, search by name in the specified guild
      const channels = guild.channels.cache.filter(
        (channel) =>
          channel.isTextBased() &&
          (channel.name.toLowerCase() === channelIdentifier.toLowerCase() ||
            channel.name.toLowerCase() ===
              channelIdentifier.toLowerCase().replace("#", ""))
      );

      if (channels.size === 0) {
        const availableChannels = guild.channels.cache
          .filter((c) => c.isTextBased())
          .map((c) => `"#${c.name}"`)
          .join(", ");
        throw new Error(
          `I can't find a channel called "${channelIdentifier}" in ${guild.name}. Here are the channels I can see: ${availableChannels}`
        );
      }
      if (channels.size > 1) {
        const channelList = channels
          .map((c) => `#${c.name} (${c.id})`)
          .join(", ");
        throw new Error(
          `Multiple channels found with name "${channelIdentifier}" in server "${guild.name}": ${channelList}. Please specify the channel ID.`
        );
      }
      return channels.first();
    }
    throw new Error(
      `Channel "${channelIdentifier}" is not a text channel or not found in server "${guild.name}"`
    );
  }

  // If no guild specified, try to fetch by ID directly
  try {
    const channel = await client.channels.fetch(channelIdentifier);
    if (channel && channel.isTextBased()) {
      return channel;
    }
    throw new Error(`Channel "${channelIdentifier}" is not a text channel`);
  } catch {
    throw new Error(
      `Channel "${channelIdentifier}" not found. When using channel names, please also specify the server.`
    );
  }
}

// Helper function to find a category by name or ID within a specific guild
async function findCategory(categoryIdentifier, guildIdentifier) {
  const client = requireDiscordClient();
  const guild = await findGuild(guildIdentifier);

  // First try to fetch by ID
  try {
    const category = await client.channels.fetch(categoryIdentifier);
    if (
      category &&
      category.guild &&
      category.guild.id === guild.id &&
      category.type === ChannelType.GuildCategory
    ) {
      return category;
    }
  } catch {
    // If fetching by ID fails, search by name in the specified guild
    const categories = guild.channels.cache.filter(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        channel.name.toLowerCase() === categoryIdentifier.toLowerCase()
    );

    if (categories.size === 0) {
      const availableCategories = guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildCategory)
        .map((c) => `"${c.name}"`)
        .join(", ");
      throw new Error(
        `Category "${categoryIdentifier}" not found in server "${guild.name}". Available categories: ${availableCategories}`
      );
    }
    if (categories.size > 1) {
      const categoryList = categories
        .map((c) => `${c.name} (${c.id})`)
        .join(", ");
      throw new Error(
        `Multiple categories found with name "${categoryIdentifier}" in server "${guild.name}": ${categoryList}. Please specify the category ID.`
      );
    }
    return categories.first();
  }
  throw new Error(
    `Category "${categoryIdentifier}" not found in server "${guild.name}"`
  );
}

// Validation schemas
const SendMessageSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z
    .string()
    .describe('Channel name (e.g., "general") or ID (including threads)'),
  content: z.string().describe("Message content"),
});

const ReadMessagesSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z
    .string()
    .describe('Channel name (e.g., "general") or ID (including threads)'),
  limit: z.number().min(1).default(50),
  before: z
    .string()
    .optional()
    .describe("Message ID to fetch messages before (for pagination)"),
  after: z
    .string()
    .optional()
    .describe("Message ID to fetch messages after (for pagination)"),
  around: z
    .string()
    .optional()
    .describe("Message ID to fetch messages around (for pagination)"),
});

const ReadMessagesBulkSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z
    .string()
    .describe('Channel name (e.g., "general") or ID (including threads)'),
  total_limit: z
    .number()
    .min(1)
    .default(200)
    .describe(
      "Total number of messages to fetch (will be fetched in batches of 100). Set to -1 for unlimited"
    ),
  unlimited: z
    .boolean()
    .optional()
    .describe(
      "Set to true to fetch all available messages (ignores total_limit)"
    ),
});

const ReactionSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z
    .string()
    .describe('Channel name (e.g., "general") or ID (including threads)'),
  message_id: z.string().describe("Message ID"),
  emoji: z.string().describe("Emoji to react with"),
});

const MultipleReactionSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z
    .string()
    .describe('Channel name (e.g., "general") or ID (including threads)'),
  message_id: z.string().describe("Message ID"),
  emojis: z.array(z.string()).describe("Array of emojis to react with"),
});

const ModerateMessageSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z
    .string()
    .describe('Channel name (e.g., "general") or ID (including threads)'),
  message_id: z.string().describe("Message ID"),
  reason: z.string().describe("Reason for moderation"),
  timeout_minutes: z
    .number()
    .min(0)
    .max(40320)
    .optional()
    .describe("Optional timeout duration in minutes"),
});

const CategoryChannelsSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  category: z.string().describe("Category name or ID"),
  limit: z.number().min(1).default(10).optional(),
});

// New schemas for additional functionality
const CreateVoiceChannelSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  name: z.string().describe("Voice channel name"),
  category_id: z
    .string()
    .optional()
    .describe("Optional category ID to place channel in"),
  user_limit: z
    .number()
    .min(0)
    .max(99)
    .optional()
    .describe("User limit (0 for unlimited)"),
  bitrate: z
    .number()
    .min(8000)
    .max(384000)
    .optional()
    .describe("Bitrate in bps"),
});

const CreateThreadSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z.string().describe("Parent channel name or ID"),
  name: z.string().describe("Thread name"),
  message_id: z
    .string()
    .optional()
    .describe("Message ID to create thread from (for message threads)"),
  auto_archive_duration: z
    .number()
    .optional()
    .describe("Auto archive duration in minutes (60, 1440, 4320, 10080)"),
  private: z
    .boolean()
    .optional()
    .describe("Create private thread (requires permissions)"),
});

const CreateRoleSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  name: z.string().describe("Role name"),
  color: z
    .string()
    .optional()
    .describe("Role color (hex color code like #FF0000)"),
  hoist: z
    .boolean()
    .optional()
    .describe("Display role separately in member list"),
  mentionable: z
    .boolean()
    .optional()
    .describe("Allow role to be mentioned by everyone"),
  permissions: z
    .array(z.string())
    .optional()
    .describe("Array of permission names"),
});

const SendEmbedSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z.string().describe("Channel name or ID"),
  title: z.string().optional().describe("Embed title"),
  description: z.string().optional().describe("Embed description"),
  color: z.string().optional().describe("Embed color (hex color code)"),
  thumbnail: z.string().optional().describe("Thumbnail image URL"),
  image: z.string().optional().describe("Main image URL"),
  author_name: z.string().optional().describe("Author name"),
  author_icon: z.string().optional().describe("Author icon URL"),
  footer_text: z.string().optional().describe("Footer text"),
  footer_icon: z.string().optional().describe("Footer icon URL"),
  fields: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        inline: z.boolean().optional(),
      })
    )
    .optional()
    .describe("Embed fields"),
});

const EditMessageSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z.string().describe("Channel name or ID"),
  message_id: z.string().describe("Message ID to edit"),
  content: z.string().optional().describe("New message content"),
  embed: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      color: z.string().optional(),
    })
    .optional()
    .describe("Embed data to add/update"),
});

const DeleteMessageSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z.string().describe("Channel name or ID"),
  message_id: z.string().describe("Message ID to delete"),
  reason: z.string().optional().describe("Reason for deletion"),
});

const CreateInviteSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z
    .string()
    .optional()
    .describe("Channel for invite (defaults to system channel)"),
  max_age: z
    .number()
    .optional()
    .describe("Invite expiration in seconds (0 for never)"),
  max_uses: z.number().optional().describe("Maximum uses (0 for unlimited)"),
  temporary: z.boolean().optional().describe("Grant temporary membership"),
  unique: z.boolean().optional().describe("Create unique invite"),
});

const ManageEmojiSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  name: z.string().describe("Emoji name"),
  image_url: z.string().optional().describe("Image URL for creating emoji"),
  emoji_id: z.string().optional().describe("Emoji ID for deleting emoji"),
});

const CreateWebhookSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z.string().describe("Channel name or ID"),
  name: z.string().describe("Webhook name"),
  avatar_url: z.string().optional().describe("Webhook avatar URL"),
});

const KickMemberSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  user_id: z.string().describe("User ID to kick"),
  reason: z.string().optional().describe("Reason for kick"),
});

const BanMemberSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  user_id: z.string().describe("User ID to ban"),
  reason: z.string().optional().describe("Reason for ban"),
  delete_days: z
    .number()
    .min(0)
    .max(7)
    .optional()
    .describe("Days of messages to delete (0-7)"),
});

const SendFileSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z.string().describe("Channel name or ID"),
  file_url: z.string().describe("File URL to send"),
  filename: z.string().optional().describe("Custom filename"),
  content: z.string().optional().describe("Message content to send with file"),
});

// Initialize MCP server
const server = new Server(
  {
    name: "discord-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available Discord tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Server Information Tools
      {
        name: "get_server_info",
        description:
          "Show me information about this Discord server including member count, creation date, and settings",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Which Discord server? (leave empty if I'm only in one server)",
            },
          },
        },
      },
      {
        name: "list_members",
        description:
          "Show me all the members in this Discord server with their roles and join dates",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            limit: {
              type: "number",
              description: "Maximum number of members to fetch",
              minimum: 1,
              maximum: 1000,
            },
          },
        },
      },

      // Category Tools
      {
        name: "list_category_channels",
        description:
          "Show me all the channels in a specific category, like 'General' or 'Gaming'",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            category: {
              type: "string",
              description: "Category name or ID",
            },
          },
          required: ["category"],
        },
      },
      {
        name: "read_category_channels",
        description:
          "Read recent messages from all channels in a category like 'Support' or 'Development'",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            category: {
              type: "string",
              description: "Category name or ID",
            },
            limit: {
              type: "number",
              description: "Number of messages to fetch per channel",
              minimum: 1,
              default: 10,
            },
          },
          required: ["category"],
        },
      },

      // Role Management Tools
      {
        name: "add_role",
        description: "Give a role like 'Moderator' or 'VIP' to a specific user",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            user_id: {
              type: "string",
              description: "User to add role to",
            },
            role_id: {
              type: "string",
              description: "Role ID to add",
            },
          },
          required: ["user_id", "role_id"],
        },
      },
      {
        name: "remove_role",
        description:
          "Take away a role like 'Member' or 'Helper' from a specific user",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            user_id: {
              type: "string",
              description: "User to remove role from",
            },
            role_id: {
              type: "string",
              description: "Role ID to remove",
            },
          },
          required: ["user_id", "role_id"],
        },
      },

      // Channel Management Tools
      {
        name: "create_text_channel",
        description:
          "Create a new text channel with a custom name and optional topic",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            name: {
              type: "string",
              description: "Channel name",
            },
            category_id: {
              type: "string",
              description: "Optional category ID to place channel in",
            },
            topic: {
              type: "string",
              description: "Optional channel topic",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "delete_channel",
        description:
          "Delete a channel permanently (be careful - this cannot be undone)",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description:
                "Channel name (e.g., 'general') or ID (including threads)",
            },
            reason: {
              type: "string",
              description: "Reason for deletion",
            },
          },
          required: ["channel"],
        },
      },

      // Message Reaction Tools
      {
        name: "add_reaction",
        description:
          "Add an emoji reaction like 👍, ❤️, or 😂 to a specific message",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description:
                "Channel name (e.g., 'general') or ID (including threads)",
            },
            message_id: {
              type: "string",
              description: "Message to react to",
            },
            emoji: {
              type: "string",
              description: "Emoji to react with (Unicode or custom emoji ID)",
            },
          },
          required: ["channel", "message_id", "emoji"],
        },
      },
      {
        name: "add_multiple_reactions",
        description:
          "Add several emoji reactions at once to a message, like 👍❤️😂",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description:
                "Channel name (e.g., 'general') or ID (including threads)",
            },
            message_id: {
              type: "string",
              description: "Message to react to",
            },
            emojis: {
              type: "array",
              items: {
                type: "string",
                description: "Emoji to react with (Unicode or custom emoji ID)",
              },
              description: "List of emojis to add as reactions",
            },
          },
          required: ["channel", "message_id", "emojis"],
        },
      },
      {
        name: "remove_reaction",
        description:
          "Remove my emoji reaction from a message (like undoing a 👍)",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description:
                "Channel name (e.g., 'general') or ID (including threads)",
            },
            message_id: {
              type: "string",
              description: "Message to remove reaction from",
            },
            emoji: {
              type: "string",
              description: "Emoji to remove (Unicode or custom emoji ID)",
            },
          },
          required: ["channel", "message_id", "emoji"],
        },
      },
      {
        name: "send_message",
        description:
          "Send a text message to any channel like #general, #announcements, or a thread",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description:
                "Which channel? (like 'general', 'announcements', or a thread name)",
            },
            content: {
              type: "string",
              description: "What message do you want to send?",
            },
          },
          required: ["channel", "content"],
        },
      },
      {
        name: "read_messages",
        description:
          "Read recent messages from any channel or thread - specify how many you want to see",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description:
                "Channel name (e.g., 'general') or ID (including threads)",
            },
            limit: {
              type: "number",
              description:
                "How many messages do you want to read? (e.g., 10, 50, 100)",
              minimum: 1,
            },
            before: {
              type: "string",
              description:
                "Message ID to fetch messages before (for pagination)",
            },
            after: {
              type: "string",
              description:
                "Message ID to fetch messages after (for pagination)",
            },
            around: {
              type: "string",
              description:
                "Message ID to fetch messages around (for pagination)",
            },
          },
          required: ["channel"],
        },
      },
      {
        name: "read_messages_bulk",
        description:
          "Read ALL messages from a channel or thread - can fetch hundreds or thousands of messages automatically",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description:
                "Channel name (e.g., 'general') or ID (including threads)",
            },
            total_limit: {
              type: "number",
              description:
                "How many messages in total? (e.g., 500, 1000, or -1 for ALL messages)",
              minimum: 1,
              default: 200,
            },
            unlimited: {
              type: "boolean",
              description:
                "Want ALL messages ever sent in this channel? Set this to true",
            },
          },
          required: ["channel"],
        },
      },
      {
        name: "get_user_info",
        description:
          "Look up detailed information about any Discord user by their ID",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "Discord user ID",
            },
          },
          required: ["user_id"],
        },
      },
      {
        name: "moderate_message",
        description:
          "Delete inappropriate messages and optionally put the user in timeout",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description:
                "Channel name (e.g., 'general') or ID (including threads)",
            },
            message_id: {
              type: "string",
              description: "ID of message to moderate",
            },
            reason: {
              type: "string",
              description: "Reason for moderation",
            },
            timeout_minutes: {
              type: "number",
              description: "Optional timeout duration in minutes",
              minimum: 0,
              maximum: 40320, // Max 4 weeks
            },
          },
          required: ["channel", "message_id", "reason"],
        },
      },

      // Voice Channel Management
      {
        name: "create_voice_channel",
        description:
          "Create a new voice channel with custom settings like user limit and bitrate",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            name: {
              type: "string",
              description: "Voice channel name",
            },
            category_id: {
              type: "string",
              description: "Optional category ID to place channel in",
            },
            user_limit: {
              type: "number",
              description: "User limit (0 for unlimited)",
              minimum: 0,
              maximum: 99,
            },
            bitrate: {
              type: "number",
              description: "Bitrate in bps",
              minimum: 8000,
              maximum: 384000,
            },
          },
          required: ["name"],
        },
      },

      // Thread Management
      {
        name: "create_thread",
        description:
          "Create a new thread in a channel, either standalone or from a message",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description: "Parent channel name or ID",
            },
            name: {
              type: "string",
              description: "Thread name",
            },
            message_id: {
              type: "string",
              description:
                "Message ID to create thread from (for message threads)",
            },
            auto_archive_duration: {
              type: "number",
              description:
                "Auto archive duration in minutes (60, 1440, 4320, 10080)",
            },
            private: {
              type: "boolean",
              description: "Create private thread (requires permissions)",
            },
          },
          required: ["channel", "name"],
        },
      },

      // Enhanced Role Management
      {
        name: "create_role",
        description:
          "Create a new role with custom permissions, color, and settings",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            name: {
              type: "string",
              description: "Role name",
            },
            color: {
              type: "string",
              description: "Role color (hex color code like #FF0000)",
            },
            hoist: {
              type: "boolean",
              description: "Display role separately in member list",
            },
            mentionable: {
              type: "boolean",
              description: "Allow role to be mentioned by everyone",
            },
            permissions: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Array of permission names",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "delete_role",
        description: "Delete a role from the server",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            role_id: {
              type: "string",
              description: "Role ID to delete",
            },
            reason: {
              type: "string",
              description: "Reason for deletion",
            },
          },
          required: ["role_id"],
        },
      },
      {
        name: "list_roles",
        description: "List all roles in the server with their permissions",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
          },
        },
      },

      // Enhanced Message Features
      {
        name: "send_embed",
        description:
          "Send a rich embed message with title, description, fields, images, and more",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description: "Channel name or ID",
            },
            title: {
              type: "string",
              description: "Embed title",
            },
            description: {
              type: "string",
              description: "Embed description",
            },
            color: {
              type: "string",
              description: "Embed color (hex color code)",
            },
            thumbnail: {
              type: "string",
              description: "Thumbnail image URL",
            },
            image: {
              type: "string",
              description: "Main image URL",
            },
            author_name: {
              type: "string",
              description: "Author name",
            },
            author_icon: {
              type: "string",
              description: "Author icon URL",
            },
            footer_text: {
              type: "string",
              description: "Footer text",
            },
            footer_icon: {
              type: "string",
              description: "Footer icon URL",
            },
            fields: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  value: { type: "string" },
                  inline: { type: "boolean" },
                },
                required: ["name", "value"],
              },
              description: "Embed fields",
            },
          },
          required: ["channel"],
        },
      },
      {
        name: "edit_message",
        description: "Edit an existing message content or embed",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description: "Channel name or ID",
            },
            message_id: {
              type: "string",
              description: "Message ID to edit",
            },
            content: {
              type: "string",
              description: "New message content",
            },
            embed: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                color: { type: "string" },
              },
              description: "Embed data to add/update",
            },
          },
          required: ["channel", "message_id"],
        },
      },
      {
        name: "delete_message",
        description: "Delete a specific message from a channel",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description: "Channel name or ID",
            },
            message_id: {
              type: "string",
              description: "Message ID to delete",
            },
            reason: {
              type: "string",
              description: "Reason for deletion",
            },
          },
          required: ["channel", "message_id"],
        },
      },
      {
        name: "send_file",
        description: "Send a file attachment to a channel",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description: "Channel name or ID",
            },
            file_url: {
              type: "string",
              description: "File URL to send",
            },
            filename: {
              type: "string",
              description: "Custom filename",
            },
            content: {
              type: "string",
              description: "Message content to send with file",
            },
          },
          required: ["channel", "file_url"],
        },
      },

      // Invite Management
      {
        name: "create_invite",
        description:
          "Create an invite link for the server with custom settings",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description: "Channel for invite (defaults to system channel)",
            },
            max_age: {
              type: "number",
              description: "Invite expiration in seconds (0 for never)",
            },
            max_uses: {
              type: "number",
              description: "Maximum uses (0 for unlimited)",
            },
            temporary: {
              type: "boolean",
              description: "Grant temporary membership",
            },
            unique: {
              type: "boolean",
              description: "Create unique invite",
            },
          },
        },
      },
      {
        name: "list_invites",
        description: "List all active invites for the server",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
          },
        },
      },

      // Emoji Management
      {
        name: "create_emoji",
        description: "Create a custom emoji for the server",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            name: {
              type: "string",
              description: "Emoji name",
            },
            image_url: {
              type: "string",
              description: "Image URL for creating emoji",
            },
          },
          required: ["name", "image_url"],
        },
      },
      {
        name: "delete_emoji",
        description: "Delete a custom emoji from the server",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            emoji_id: {
              type: "string",
              description: "Emoji ID to delete",
            },
            reason: {
              type: "string",
              description: "Reason for deletion",
            },
          },
          required: ["emoji_id"],
        },
      },
      {
        name: "list_emojis",
        description: "List all custom emojis in the server",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
          },
        },
      },

      // Webhook Management
      {
        name: "create_webhook",
        description: "Create a webhook for a channel",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description: "Channel name or ID",
            },
            name: {
              type: "string",
              description: "Webhook name",
            },
            avatar_url: {
              type: "string",
              description: "Webhook avatar URL",
            },
          },
          required: ["channel", "name"],
        },
      },
      {
        name: "list_webhooks",
        description: "List all webhooks in the server",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
          },
        },
      },

      // Advanced Moderation
      {
        name: "kick_member",
        description: "Kick a member from the server",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            user_id: {
              type: "string",
              description: "User ID to kick",
            },
            reason: {
              type: "string",
              description: "Reason for kick",
            },
          },
          required: ["user_id"],
        },
      },
      {
        name: "ban_member",
        description: "Ban a member from the server",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            user_id: {
              type: "string",
              description: "User ID to ban",
            },
            reason: {
              type: "string",
              description: "Reason for ban",
            },
            delete_days: {
              type: "number",
              description: "Days of messages to delete (0-7)",
              minimum: 0,
              maximum: 7,
            },
          },
          required: ["user_id"],
        },
      },
      {
        name: "unban_member",
        description: "Unban a member from the server",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            user_id: {
              type: "string",
              description: "User ID to unban",
            },
            reason: {
              type: "string",
              description: "Reason for unban",
            },
          },
          required: ["user_id"],
        },
      },
      {
        name: "timeout_member",
        description: "Put a member in timeout for a specified duration",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            user_id: {
              type: "string",
              description: "User ID to timeout",
            },
            duration_minutes: {
              type: "number",
              description: "Timeout duration in minutes",
              minimum: 1,
              maximum: 40320,
            },
            reason: {
              type: "string",
              description: "Reason for timeout",
            },
          },
          required: ["user_id", "duration_minutes"],
        },
      },

      // Channel Information
      {
        name: "list_channels",
        description: "List all channels in the server organized by category",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            include_threads: {
              type: "boolean",
              description: "Include active threads in the list",
            },
          },
        },
      },
      {
        name: "get_channel_info",
        description: "Get detailed information about a specific channel",
        inputSchema: {
          type: "object",
          properties: {
            server: {
              type: "string",
              description:
                "Server name or ID (optional if bot is only in one server)",
            },
            channel: {
              type: "string",
              description: "Channel name or ID",
            },
          },
          required: ["channel"],
        },
      },
    ],
  };
});

// Handle Discord tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const client = requireDiscordClient();

  try {
    switch (name) {
      case "send_message": {
        const { server, channel, content } = SendMessageSchema.parse(args);
        const channelObj = await findChannel(channel, server);
        const message = await channelObj.send(content);
        return {
          content: [
            {
              type: "text",
              text: `✅ Your message has been sent to #${channelObj.name} in ${channelObj.guild.name}!`,
            },
          ],
        };
      }

      case "read_messages": {
        const { server, channel, limit, before, after, around } =
          ReadMessagesSchema.parse(args);
        const channelObj = await findChannel(channel, server);

        // Build fetch options with pagination parameters
        const fetchOptions = { limit };
        if (before) fetchOptions.before = before;
        if (after) fetchOptions.after = after;
        if (around) fetchOptions.around = around;

        const messages = await channelObj.messages.fetch(fetchOptions);

        const messageList = Array.from(messages.values()).map((message) => {
          const reactionData = message.reactions.cache.map((reaction) => ({
            emoji:
              reaction.emoji.name ||
              reaction.emoji.id ||
              reaction.emoji.toString(),
            count: reaction.count,
          }));

          return {
            id: message.id,
            author: message.author.tag,
            content: message.content,
            timestamp: message.createdAt.toISOString(),
            reactions: reactionData,
          };
        });

        const formatReaction = (r) => `${r.emoji}(${r.count})`;

        // Get the oldest and newest message IDs for pagination info
        const oldestMessage =
          messageList.length > 0 ? messageList[messageList.length - 1] : null;
        const newestMessage = messageList.length > 0 ? messageList[0] : null;

        let paginationInfo = "";
        if (messageList.length > 0) {
          paginationInfo =
            `\n\nPagination Info:\n` +
            `- To get older messages, use: before=${oldestMessage.id}\n` +
            `- To get newer messages, use: after=${newestMessage.id}`;
        }

        return {
          content: [
            {
              type: "text",
              text:
                `Retrieved ${messageList.length} messages from #${channelObj.name} in ${channelObj.guild.name}:\n\n` +
                messageList
                  .map(
                    (m) =>
                      `[${m.id}] ${m.author} (${m.timestamp}): ${m.content}\n` +
                      `Reactions: ${
                        m.reactions.length > 0
                          ? m.reactions.map(formatReaction).join(", ")
                          : "No reactions"
                      }`
                  )
                  .join("\n\n") +
                paginationInfo,
            },
          ],
        };
      }

      case "read_messages_bulk": {
        const { server, channel, total_limit, unlimited } =
          ReadMessagesBulkSchema.parse(args);
        const channelObj = await findChannel(channel, server);

        let allMessages = [];
        let before = null;
        let remainingLimit =
          unlimited || total_limit === -1 ? Infinity : total_limit;

        while (remainingLimit > 0) {
          const batchLimit =
            unlimited || total_limit === -1
              ? 100
              : Math.min(remainingLimit, 100);
          const fetchOptions = { limit: batchLimit };
          if (before) fetchOptions.before = before;

          const messages = await channelObj.messages.fetch(fetchOptions);
          const messageArray = Array.from(messages.values());

          if (messageArray.length === 0) {
            break; // No more messages to fetch
          }

          allMessages = allMessages.concat(messageArray);

          if (!unlimited && total_limit !== -1) {
            remainingLimit -= messageArray.length;
          }

          // Set the before parameter to the ID of the oldest message in this batch
          before = messageArray[messageArray.length - 1].id;

          // If we got fewer messages than requested, we've reached the end
          if (messageArray.length < batchLimit) {
            break;
          }
        }

        const messageList = allMessages.map((message) => {
          const reactionData = message.reactions.cache.map((reaction) => ({
            emoji:
              reaction.emoji.name ||
              reaction.emoji.id ||
              reaction.emoji.toString(),
            count: reaction.count,
          }));

          return {
            id: message.id,
            author: message.author.tag,
            content: message.content,
            timestamp: message.createdAt.toISOString(),
            reactions: reactionData,
          };
        });

        const formatReaction = (r) => `${r.emoji}(${r.count})`;

        return {
          content: [
            {
              type: "text",
              text:
                `Retrieved ${messageList.length} messages from #${channelObj.name} in ${channelObj.guild.name} (requested: ${total_limit}):\n\n` +
                messageList
                  .map(
                    (m) =>
                      `[${m.id}] ${m.author} (${m.timestamp}): ${m.content}\n` +
                      `Reactions: ${
                        m.reactions.length > 0
                          ? m.reactions.map(formatReaction).join(", ")
                          : "No reactions"
                      }`
                  )
                  .join("\n\n"),
            },
          ],
        };
      }

      // Category tools
      case "list_category_channels": {
        const { server, category } = CategoryChannelsSchema.parse(args);
        const categoryObj = await findCategory(category, server);

        // Filter out threads from category children
        const channels = categoryObj.children.cache.filter(
          (channel) => channel.isTextBased() && !channel.isThread()
        );

        const channelList = Array.from(channels.values()).map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          topic: channel.topic,
        }));

        return {
          content: [
            {
              type: "text",
              text:
                `Channels in category "${categoryObj.name}" (${channelList.length}):\n` +
                channelList
                  .map(
                    (c) =>
                      `#${c.name} (ID: ${c.id})${
                        c.topic ? ` - ${c.topic}` : ""
                      }`
                  )
                  .join("\n"),
            },
          ],
        };
      }

      case "read_category_channels": {
        const {
          server,
          category,
          limit = 10,
        } = CategoryChannelsSchema.parse(args);
        const categoryObj = await findCategory(category, server);

        // Filter out threads from category children
        const channels = categoryObj.children.cache.filter(
          (channel) => channel.isTextBased() && !channel.isThread()
        );

        let allMessages = [];

        for (const channel of channels.values()) {
          try {
            const messages = await channel.messages.fetch({
              limit: limit,
            });
            const messageList = Array.from(messages.values()).map(
              (message) => ({
                channel: channel.name,
                id: message.id,
                author: message.author.tag,
                content: message.content,
                timestamp: message.createdAt.toISOString(),
              })
            );
            allMessages = allMessages.concat(messageList);
          } catch (error) {
            // Skip channels we can't read
            console.error(
              `Could not read messages from #${channel.name}: ${error.message}`
            );
            continue;
          }
        }

        // Sort by timestamp (newest first)
        allMessages.sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );

        return {
          content: [
            {
              type: "text",
              text:
                `Retrieved ${allMessages.length} messages from category "${categoryObj.name}" (excluding threads):\n\n` +
                allMessages
                  .map(
                    (m) =>
                      `#${m.channel} - ${m.author} (${m.timestamp}): ${m.content}`
                  )
                  .join("\n\n"),
            },
          ],
        };
      }

      case "get_user_info": {
        const user = await client.users.fetch(args.user_id);
        const userInfo = {
          id: user.id,
          name: user.username,
          discriminator: user.discriminator,
          bot: user.bot,
          created_at: user.createdAt.toISOString(),
        };

        return {
          content: [
            {
              type: "text",
              text:
                `User information:\n` +
                `Name: ${userInfo.name}#${userInfo.discriminator}\n` +
                `ID: ${userInfo.id}\n` +
                `Bot: ${userInfo.bot}\n` +
                `Created: ${userInfo.created_at}`,
            },
          ],
        };
      }

      case "moderate_message": {
        const { server, channel, message_id, reason, timeout_minutes } =
          ModerateMessageSchema.parse(args);
        const channelObj = await findChannel(channel, server);
        const message = await channelObj.messages.fetch(message_id);

        // Delete the message
        await message.delete();

        // Handle timeout if specified
        if (timeout_minutes && timeout_minutes > 0) {
          if (message.member) {
            const duration = timeout_minutes * 60 * 1000; // Convert to milliseconds
            await message.member.timeout(duration, reason);
            return {
              content: [
                {
                  type: "text",
                  text: `Message deleted from #${channelObj.name} in ${channelObj.guild.name} and user timed out for ${timeout_minutes} minutes.`,
                },
              ],
            };
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Message deleted successfully from #${channelObj.name} in ${channelObj.guild.name}.`,
            },
          ],
        };
      }

      // Server Information Tools
      case "get_server_info": {
        const guild = await findGuild(args.server);
        const info = {
          name: guild.name,
          id: guild.id,
          owner_id: guild.ownerId,
          member_count: guild.memberCount,
          created_at: guild.createdAt.toISOString(),
          description: guild.description,
          premium_tier: guild.premiumTier,
          explicit_content_filter: guild.explicitContentFilter,
        };

        return {
          content: [
            {
              type: "text",
              text:
                `Server Information:\n` +
                Object.entries(info)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n"),
            },
          ],
        };
      }

      case "list_members": {
        const guild = await findGuild(args.server);
        const limit = Math.min(args.limit || 100, 1000);

        const members = await guild.members.fetch({ limit });
        const memberList = Array.from(members.values()).map((member) => ({
          id: member.id,
          name: member.user.username,
          nick: member.nickname,
          joined_at: member.joinedAt ? member.joinedAt.toISOString() : null,
          roles: member.roles.cache
            .filter((role) => role.name !== "@everyone")
            .map((role) => role.id),
        }));

        return {
          content: [
            {
              type: "text",
              text:
                `Server Members (${memberList.length}):\n` +
                memberList
                  .map(
                    (m) =>
                      `${m.name} (ID: ${m.id}, Roles: ${m.roles.join(", ")})`
                  )
                  .join("\n"),
            },
          ],
        };
      }

      // Role Management Tools
      case "add_role": {
        const guild = await findGuild(args.server);
        const member = await guild.members.fetch(args.user_id);
        const role = await guild.roles.fetch(args.role_id);

        await member.roles.add(role, "Role added via MCP");
        return {
          content: [
            {
              type: "text",
              text: `Added role ${role.name} to user ${member.user.username} in ${guild.name}`,
            },
          ],
        };
      }

      case "remove_role": {
        const guild = await findGuild(args.server);
        const member = await guild.members.fetch(args.user_id);
        const role = await guild.roles.fetch(args.role_id);

        await member.roles.remove(role, "Role removed via MCP");
        return {
          content: [
            {
              type: "text",
              text: `Removed role ${role.name} from user ${member.user.username} in ${guild.name}`,
            },
          ],
        };
      }

      // Channel Management Tools
      case "create_text_channel": {
        const guild = await findGuild(args.server);
        const options = {
          name: args.name,
          reason: "Channel created via MCP",
        };

        if (args.category_id) {
          options.parent = args.category_id;
        }
        if (args.topic) {
          options.topic = args.topic;
        }

        const channel = await guild.channels.create(options);

        return {
          content: [
            {
              type: "text",
              text: `Created text channel #${channel.name} (ID: ${channel.id}) in ${guild.name}`,
            },
          ],
        };
      }

      case "delete_channel": {
        const channel = await findChannel(args.channel, args.server);
        const guildName = channel.guild.name;
        const channelName = channel.name;
        await channel.delete(args.reason || "Channel deleted via MCP");
        return {
          content: [
            {
              type: "text",
              text: `Deleted channel #${channelName} from ${guildName} successfully`,
            },
          ],
        };
      }

      // Message Reaction Tools
      case "add_reaction": {
        const { server, channel, message_id, emoji } =
          ReactionSchema.parse(args);
        const channelObj = await findChannel(channel, server);
        const message = await channelObj.messages.fetch(message_id);
        await message.react(emoji);
        return {
          content: [
            {
              type: "text",
              text: `Added reaction ${emoji} to message in #${channelObj.name} in ${channelObj.guild.name}`,
            },
          ],
        };
      }

      case "add_multiple_reactions": {
        const { server, channel, message_id, emojis } =
          MultipleReactionSchema.parse(args);
        const channelObj = await findChannel(channel, server);
        const message = await channelObj.messages.fetch(message_id);
        for (const emoji of emojis) {
          await message.react(emoji);
        }
        return {
          content: [
            {
              type: "text",
              text: `Added reactions: ${emojis.join(", ")} to message in #${
                channelObj.name
              } in ${channelObj.guild.name}`,
            },
          ],
        };
      }

      case "remove_reaction": {
        const { server, channel, message_id, emoji } =
          ReactionSchema.parse(args);
        const channelObj = await findChannel(channel, server);
        const message = await channelObj.messages.fetch(message_id);
        await message.reactions.cache.get(emoji)?.users.remove(client.user);
        return {
          content: [
            {
              type: "text",
              text: `Removed reaction ${emoji} from message in #${channelObj.name} in ${channelObj.guild.name}`,
            },
          ],
        };
      }

      // Voice Channel Management
      case "create_voice_channel": {
        const { server, name, category_id, user_limit, bitrate } =
          CreateVoiceChannelSchema.parse(args);
        const guild = await findGuild(server);
        const options = {
          name: name,
          type: ChannelType.GuildVoice,
          reason: "Voice channel created via MCP",
        };

        if (category_id) {
          options.parent = category_id;
        }
        if (user_limit !== undefined) {
          options.userLimit = user_limit;
        }
        if (bitrate) {
          options.bitrate = bitrate;
        }

        const channel = await guild.channels.create(options);

        return {
          content: [
            {
              type: "text",
              text: `Created voice channel "${channel.name}" (ID: ${channel.id}) in ${guild.name}`,
            },
          ],
        };
      }

      // Thread Management
      case "create_thread": {
        const {
          server,
          channel,
          name,
          message_id,
          auto_archive_duration,
          private: isPrivate,
        } = CreateThreadSchema.parse(args);
        const channelObj = await findChannel(channel, server);

        let thread;
        if (message_id) {
          // Create thread from message
          const message = await channelObj.messages.fetch(message_id);
          thread = await message.startThread({
            name: name,
            autoArchiveDuration: auto_archive_duration || 60,
            reason: "Thread created via MCP",
          });
        } else {
          // Create standalone thread
          const options = {
            name: name,
            autoArchiveDuration: auto_archive_duration || 60,
            reason: "Thread created via MCP",
          };

          if (isPrivate) {
            options.type = ChannelType.PrivateThread;
          }

          thread = await channelObj.threads.create(options);
        }

        return {
          content: [
            {
              type: "text",
              text: `Created thread "${thread.name}" (ID: ${thread.id}) in #${channelObj.name}`,
            },
          ],
        };
      }

      // Enhanced Role Management
      case "create_role": {
        const { server, name, color, hoist, mentionable, permissions } =
          CreateRoleSchema.parse(args);
        const guild = await findGuild(server);

        const options = {
          name: name,
          reason: "Role created via MCP",
        };

        if (color) {
          options.color = color;
        }
        if (hoist !== undefined) {
          options.hoist = hoist;
        }
        if (mentionable !== undefined) {
          options.mentionable = mentionable;
        }
        if (permissions && permissions.length > 0) {
          // Convert permission names to flags
          const permissionFlags = permissions.map((perm) => {
            const flag = PermissionFlagsBits[perm];
            if (!flag) {
              throw new Error(`Unknown permission: ${perm}`);
            }
            return flag;
          });
          options.permissions = permissionFlags;
        }

        const role = await guild.roles.create(options);

        return {
          content: [
            {
              type: "text",
              text: `Created role "${role.name}" (ID: ${role.id}) in ${guild.name}`,
            },
          ],
        };
      }

      case "delete_role": {
        const { server, role_id, reason } = args;
        const guild = await findGuild(server);
        const role = await guild.roles.fetch(role_id);

        if (!role) {
          throw new Error(`Role with ID ${role_id} not found`);
        }

        const roleName = role.name;
        await role.delete(reason || "Role deleted via MCP");

        return {
          content: [
            {
              type: "text",
              text: `Deleted role "${roleName}" from ${guild.name}`,
            },
          ],
        };
      }

      case "list_roles": {
        const guild = await findGuild(args.server);
        const roles = Array.from(guild.roles.cache.values())
          .filter((role) => role.name !== "@everyone")
          .sort((a, b) => b.position - a.position)
          .map((role) => ({
            id: role.id,
            name: role.name,
            color: role.hexColor,
            position: role.position,
            members: role.members.size,
            mentionable: role.mentionable,
            hoist: role.hoist,
            permissions: role.permissions.toArray(),
          }));

        return {
          content: [
            {
              type: "text",
              text:
                `Roles in ${guild.name} (${roles.length}):\n` +
                roles
                  .map(
                    (r) =>
                      `${r.name} (ID: ${r.id}, Members: ${r.members}, Color: ${r.color}, Mentionable: ${r.mentionable})`
                  )
                  .join("\n"),
            },
          ],
        };
      }

      // Enhanced Message Features
      case "send_embed": {
        const {
          server,
          channel,
          title,
          description,
          color,
          thumbnail,
          image,
          author_name,
          author_icon,
          footer_text,
          footer_icon,
          fields,
        } = SendEmbedSchema.parse(args);
        const channelObj = await findChannel(channel, server);

        const embed = new EmbedBuilder();

        if (title) embed.setTitle(title);
        if (description) embed.setDescription(description);
        if (color) embed.setColor(color);
        if (thumbnail) embed.setThumbnail(thumbnail);
        if (image) embed.setImage(image);
        if (author_name) {
          embed.setAuthor({
            name: author_name,
            iconURL: author_icon,
          });
        }
        if (footer_text) {
          embed.setFooter({
            text: footer_text,
            iconURL: footer_icon,
          });
        }
        if (fields && fields.length > 0) {
          embed.addFields(fields);
        }

        await channelObj.send({ embeds: [embed] });

        return {
          content: [
            {
              type: "text",
              text: `Sent embed message to #${channelObj.name} in ${channelObj.guild.name}`,
            },
          ],
        };
      }

      case "edit_message": {
        const { server, channel, message_id, content, embed } =
          EditMessageSchema.parse(args);
        const channelObj = await findChannel(channel, server);
        const message = await channelObj.messages.fetch(message_id);

        const editOptions = {};
        if (content !== undefined) {
          editOptions.content = content;
        }
        if (embed) {
          const embedBuilder = new EmbedBuilder();
          if (embed.title) embedBuilder.setTitle(embed.title);
          if (embed.description) embedBuilder.setDescription(embed.description);
          if (embed.color) embedBuilder.setColor(embed.color);
          editOptions.embeds = [embedBuilder];
        }

        await message.edit(editOptions);

        return {
          content: [
            {
              type: "text",
              text: `Edited message in #${channelObj.name} in ${channelObj.guild.name}`,
            },
          ],
        };
      }

      case "delete_message": {
        const { server, channel, message_id, reason } =
          DeleteMessageSchema.parse(args);
        const channelObj = await findChannel(channel, server);
        const message = await channelObj.messages.fetch(message_id);

        await message.delete();

        return {
          content: [
            {
              type: "text",
              text: `Deleted message from #${channelObj.name} in ${channelObj.guild.name}`,
            },
          ],
        };
      }

      case "send_file": {
        const { server, channel, file_url, filename, content } =
          SendFileSchema.parse(args);
        const channelObj = await findChannel(channel, server);

        const attachment = new AttachmentBuilder(file_url, {
          name: filename || "file",
        });

        const messageOptions = { files: [attachment] };
        if (content) {
          messageOptions.content = content;
        }

        await channelObj.send(messageOptions);

        return {
          content: [
            {
              type: "text",
              text: `Sent file to #${channelObj.name} in ${channelObj.guild.name}`,
            },
          ],
        };
      }

      // Invite Management
      case "create_invite": {
        const { server, channel, max_age, max_uses, temporary, unique } =
          CreateInviteSchema.parse(args);

        let targetChannel;
        if (channel) {
          targetChannel = await findChannel(channel, server);
        } else {
          const guild = await findGuild(server);
          targetChannel =
            guild.systemChannel ||
            guild.channels.cache.filter((c) => c.isTextBased()).first();
          if (!targetChannel) {
            throw new Error("No suitable channel found for invite");
          }
        }

        const options = {};
        if (max_age !== undefined) options.maxAge = max_age;
        if (max_uses !== undefined) options.maxUses = max_uses;
        if (temporary !== undefined) options.temporary = temporary;
        if (unique !== undefined) options.unique = unique;

        const invite = await targetChannel.createInvite(options);

        return {
          content: [
            {
              type: "text",
              text: `Created invite: ${invite.url}\nExpires: ${
                max_age === 0 ? "Never" : `${max_age}s`
              }\nMax uses: ${max_uses || "Unlimited"}`,
            },
          ],
        };
      }

      case "list_invites": {
        const guild = await findGuild(args.server);
        const invites = await guild.invites.fetch();

        const inviteList = Array.from(invites.values()).map((invite) => ({
          code: invite.code,
          url: invite.url,
          channel: invite.channel?.name || "Unknown",
          inviter: invite.inviter?.tag || "Unknown",
          uses: invite.uses,
          max_uses: invite.maxUses,
          expires_at: invite.expiresAt
            ? invite.expiresAt.toISOString()
            : "Never",
          temporary: invite.temporary,
        }));

        return {
          content: [
            {
              type: "text",
              text:
                `Active invites for ${guild.name} (${inviteList.length}):\n` +
                inviteList
                  .map(
                    (i) =>
                      `${i.code} - #${i.channel} by ${i.inviter} (${i.uses}/${
                        i.max_uses || "∞"
                      } uses, expires: ${i.expires_at})`
                  )
                  .join("\n"),
            },
          ],
        };
      }

      // Emoji Management
      case "create_emoji": {
        const { server, name, image_url } = ManageEmojiSchema.parse(args);
        const guild = await findGuild(server);

        const emoji = await guild.emojis.create({
          attachment: image_url,
          name: name,
          reason: "Emoji created via MCP",
        });

        return {
          content: [
            {
              type: "text",
              text: `Created emoji :${emoji.name}: (ID: ${emoji.id}) in ${guild.name}`,
            },
          ],
        };
      }

      case "delete_emoji": {
        const { server, emoji_id, reason } = ManageEmojiSchema.parse(args);
        const guild = await findGuild(server);
        const emoji = await guild.emojis.fetch(emoji_id);

        if (!emoji) {
          throw new Error(`Emoji with ID ${emoji_id} not found`);
        }

        const emojiName = emoji.name;
        await emoji.delete(reason || "Emoji deleted via MCP");

        return {
          content: [
            {
              type: "text",
              text: `Deleted emoji :${emojiName}: from ${guild.name}`,
            },
          ],
        };
      }

      case "list_emojis": {
        const guild = await findGuild(args.server);
        const emojis = Array.from(guild.emojis.cache.values()).map((emoji) => ({
          id: emoji.id,
          name: emoji.name,
          animated: emoji.animated,
          url: emoji.url,
          author: emoji.author?.tag || "Unknown",
        }));

        return {
          content: [
            {
              type: "text",
              text:
                `Custom emojis in ${guild.name} (${emojis.length}):\n` +
                emojis
                  .map(
                    (e) => `:${e.name}: (ID: ${e.id}, Animated: ${e.animated})`
                  )
                  .join("\n"),
            },
          ],
        };
      }

      // Webhook Management
      case "create_webhook": {
        const { server, channel, name, avatar_url } =
          CreateWebhookSchema.parse(args);
        const channelObj = await findChannel(channel, server);

        const options = { name: name };
        if (avatar_url) {
          options.avatar = avatar_url;
        }

        const webhook = await channelObj.createWebhook(options);

        return {
          content: [
            {
              type: "text",
              text: `Created webhook "${webhook.name}" (ID: ${webhook.id}) for #${channelObj.name}\nURL: ${webhook.url}`,
            },
          ],
        };
      }

      case "list_webhooks": {
        const guild = await findGuild(args.server);
        const webhooks = await guild.fetchWebhooks();

        const webhookList = Array.from(webhooks.values()).map((webhook) => ({
          id: webhook.id,
          name: webhook.name,
          channel: webhook.channel?.name || "Unknown",
          owner: webhook.owner?.tag || "Unknown",
          url: webhook.url,
        }));

        return {
          content: [
            {
              type: "text",
              text:
                `Webhooks in ${guild.name} (${webhookList.length}):\n` +
                webhookList
                  .map((w) => `${w.name} - #${w.channel} (Owner: ${w.owner})`)
                  .join("\n"),
            },
          ],
        };
      }

      // Advanced Moderation
      case "kick_member": {
        const { server, user_id, reason } = KickMemberSchema.parse(args);
        const guild = await findGuild(server);
        const member = await guild.members.fetch(user_id);

        const username = member.user.username;
        await member.kick(reason || "Kicked via MCP");

        return {
          content: [
            {
              type: "text",
              text: `Kicked ${username} from ${guild.name}`,
            },
          ],
        };
      }

      case "ban_member": {
        const { server, user_id, reason, delete_days } =
          BanMemberSchema.parse(args);
        const guild = await findGuild(server);

        const options = {};
        if (delete_days !== undefined) {
          options.deleteMessageDays = delete_days;
        }
        if (reason) {
          options.reason = reason;
        }

        const user = await client.users.fetch(user_id);
        await guild.members.ban(user, options);

        return {
          content: [
            {
              type: "text",
              text: `Banned ${user.username} from ${guild.name}`,
            },
          ],
        };
      }

      case "unban_member": {
        const { server, user_id, reason } = args;
        const guild = await findGuild(server);
        const user = await client.users.fetch(user_id);

        await guild.members.unban(user, reason || "Unbanned via MCP");

        return {
          content: [
            {
              type: "text",
              text: `Unbanned ${user.username} from ${guild.name}`,
            },
          ],
        };
      }

      case "timeout_member": {
        const { server, user_id, duration_minutes, reason } = args;
        const guild = await findGuild(server);
        const member = await guild.members.fetch(user_id);

        const duration = duration_minutes * 60 * 1000; // Convert to milliseconds
        await member.timeout(duration, reason || "Timed out via MCP");

        return {
          content: [
            {
              type: "text",
              text: `Put ${member.user.username} in timeout for ${duration_minutes} minutes in ${guild.name}`,
            },
          ],
        };
      }

      // Channel Information
      case "list_channels": {
        const { server, include_threads } = args;
        const guild = await findGuild(server);

        const categories = Array.from(guild.channels.cache.values())
          .filter((channel) => channel.type === ChannelType.GuildCategory)
          .sort((a, b) => a.position - b.position);

        const uncategorized = Array.from(guild.channels.cache.values()).filter(
          (channel) =>
            !channel.parent &&
            channel.type !== ChannelType.GuildCategory &&
            (channel.isTextBased() || channel.type === ChannelType.GuildVoice)
        );

        let result = `Channels in ${guild.name}:\n\n`;

        // List categorized channels
        for (const category of categories) {
          result += `📁 ${category.name}\n`;
          const channelsInCategory = Array.from(
            category.children.cache.values()
          )
            .filter((channel) => !channel.isThread())
            .sort((a, b) => a.position - b.position);

          for (const channel of channelsInCategory) {
            const emoji = channel.type === ChannelType.GuildVoice ? "🔊" : "#";
            result += `  ${emoji} ${channel.name}\n`;

            if (include_threads && channel.isTextBased()) {
              const threads = Array.from(channel.threads.cache.values());
              for (const thread of threads) {
                result += `    🧵 ${thread.name}\n`;
              }
            }
          }
          result += "\n";
        }

        // List uncategorized channels
        if (uncategorized.length > 0) {
          result += "📁 Uncategorized\n";
          for (const channel of uncategorized) {
            const emoji = channel.type === ChannelType.GuildVoice ? "🔊" : "#";
            result += `  ${emoji} ${channel.name}\n`;

            if (include_threads && channel.isTextBased()) {
              const threads = Array.from(channel.threads.cache.values());
              for (const thread of threads) {
                result += `    🧵 ${thread.name}\n`;
              }
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "get_channel_info": {
        const { server, channel } = args;
        const channelObj = await findChannel(channel, server);

        const info = {
          id: channelObj.id,
          name: channelObj.name,
          type: channelObj.type,
          created_at: channelObj.createdAt.toISOString(),
          nsfw: channelObj.nsfw,
          position: channelObj.position,
        };

        if (channelObj.topic) info.topic = channelObj.topic;
        if (channelObj.parent) info.category = channelObj.parent.name;
        if (channelObj.type === ChannelType.GuildVoice) {
          info.user_limit = channelObj.userLimit;
          info.bitrate = channelObj.bitrate;
        }
        if (channelObj.isThread()) {
          info.parent_channel = channelObj.parent?.name;
          info.archived = channelObj.archived;
          info.auto_archive_duration = channelObj.autoArchiveDuration;
        }

        return {
          content: [
            {
              type: "text",
              text:
                `Channel Information:\n` +
                Object.entries(info)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n"),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        content: [
          {
            type: "text",
            text: `Invalid arguments: ${error.errors
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join(", ")}`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  // Start Discord bot
  await client.login(DISCORD_TOKEN);

  // Wait for Discord client to be ready
  await new Promise((resolve) => {
    if (discordClient) {
      resolve();
    } else {
      client.once("ready", resolve);
    }
  });

  // Run MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Discord MCP Server running on stdio");
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.error("\nShutting down Discord MCP server...");
  await client.destroy();
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Error running Discord MCP server:", error);
    process.exit(1);
  });
}

export default { main };
