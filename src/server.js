#!/usr/bin/env node

import { Client, GatewayIntentBits, ChannelType } from "discord.js";
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
      `Bot is in multiple servers. Please specify server name or ID. Available servers: ${guildList}`
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
        `Server "${guildIdentifier}" not found. Available servers: ${availableGuilds}`
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

// Helper function to find a channel by name or ID within a specific guild (excludes threads)
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
        !channel.isThread()
      ) {
        return channel;
      }
    } catch {
      // If fetching by ID fails, search by name in the specified guild
      const channels = guild.channels.cache.filter(
        (channel) =>
          channel.isTextBased() &&
          !channel.isThread() &&
          (channel.name.toLowerCase() === channelIdentifier.toLowerCase() ||
            channel.name.toLowerCase() ===
              channelIdentifier.toLowerCase().replace("#", ""))
      );

      if (channels.size === 0) {
        const availableChannels = guild.channels.cache
          .filter((c) => c.isTextBased() && !c.isThread())
          .map((c) => `"#${c.name}"`)
          .join(", ");
        throw new Error(
          `Channel "${channelIdentifier}" not found in server "${guild.name}". Available channels: ${availableChannels}`
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
    if (channel && channel.isTextBased() && !channel.isThread()) {
      return channel;
    }
    throw new Error(
      `Channel "${channelIdentifier}" is not a text channel or is a thread`
    );
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
  channel: z.string().describe('Channel name (e.g., "general") or ID'),
  content: z.string().describe("Message content"),
});

const ReadMessagesSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z.string().describe('Channel name (e.g., "general") or ID'),
  limit: z.number().min(1).default(50),
});

const ReactionSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z.string().describe('Channel name (e.g., "general") or ID'),
  message_id: z.string().describe("Message ID"),
  emoji: z.string().describe("Emoji to react with"),
});

const MultipleReactionSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z.string().describe('Channel name (e.g., "general") or ID'),
  message_id: z.string().describe("Message ID"),
  emojis: z.array(z.string()).describe("Array of emojis to react with"),
});

const ModerateMessageSchema = z.object({
  server: z
    .string()
    .optional()
    .describe("Server name or ID (optional if bot is only in one server)"),
  channel: z.string().describe('Channel name (e.g., "general") or ID'),
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
  limit: z.number().min(1).max(50).default(10).optional(),
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
        description: "Get information about a Discord server",
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
      {
        name: "list_members",
        description: "Get a list of members in a server",
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
          "List all channels in a specified category (excludes threads)",
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
          "Read recent messages from all channels in a category (excludes threads)",
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
              description: "Number of messages to fetch per channel (max 50)",
              minimum: 1,
              maximum: 50,
              default: 10,
            },
          },
          required: ["category"],
        },
      },

      // Role Management Tools
      {
        name: "add_role",
        description: "Add a role to a user",
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
        description: "Remove a role from a user",
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
        description: "Create a new text channel",
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
        description: "Delete a channel",
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
              description: "Channel name (e.g., 'general') or ID",
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
        description: "Add a reaction to a message",
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
              description: "Channel name (e.g., 'general') or ID",
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
        description: "Add multiple reactions to a message",
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
              description: "Channel name (e.g., 'general') or ID",
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
        description: "Remove a reaction from a message",
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
              description: "Channel name (e.g., 'general') or ID",
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
        description: "Send a message to a specific channel",
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
              description: "Channel name (e.g., 'general') or ID",
            },
            content: {
              type: "string",
              description: "Message content",
            },
          },
          required: ["channel", "content"],
        },
      },
      {
        name: "read_messages",
        description: "Read recent messages from a channel",
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
              description: "Channel name (e.g., 'general') or ID",
            },
            limit: {
              type: "number",
              description: "Number of messages to fetch (no maximum limit)",
              minimum: 1,
            },
          },
          required: ["channel"],
        },
      },
      {
        name: "get_user_info",
        description: "Get information about a Discord user",
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
        description: "Delete a message and optionally timeout the user",
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
              description: "Channel name (e.g., 'general') or ID",
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
              text: `Message sent successfully to #${channelObj.name} in ${channelObj.guild.name}. Message ID: ${message.id}`,
            },
          ],
        };
      }

      case "read_messages": {
        const { server, channel, limit } = ReadMessagesSchema.parse(args);
        const channelObj = await findChannel(channel, server);
        const messages = await channelObj.messages.fetch({ limit });

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

        return {
          content: [
            {
              type: "text",
              text:
                `Retrieved ${messageList.length} messages from #${channelObj.name} in ${channelObj.guild.name}:\n\n` +
                messageList
                  .map(
                    (m) =>
                      `${m.author} (${m.timestamp}): ${m.content}\n` +
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
              limit: Math.min(limit, 50),
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
