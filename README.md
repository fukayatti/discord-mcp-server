# Discord MCP Server

A **Model Context Protocol (MCP)** server that provides comprehensive Discord integration capabilities. This server enables MCP clients like Claude Desktop to interact with Discord servers through a rich set of tools for message management, server administration, and user interaction.

## 🚀 Features

### 📊 Server Management

- Get detailed server information and statistics
- List server members with roles and permissions
- Access server configuration and metadata

### 💬 Message Operations

- **Send Messages**: Post messages to any accessible channel
- **Read Messages**: Retrieve message history with reactions and pagination support
- **Bulk Message Reading**: Automatically fetch large amounts of messages with unlimited support
- **Message Pagination**: Navigate through message history using before/after/around parameters
- **Message Moderation**: Delete inappropriate content and manage users
- **Reaction Management**: Add, remove, and manage message reactions

### 🗂️ Channel Management

- **Create Channels**: Set up new text channels with categories and topics
- **Delete Channels**: Remove unwanted channels safely
- **Category Operations**: List and manage channels within categories
- **Bulk Channel Reading**: Read messages from all channels in a category

### 👥 User & Role Management

- **Role Assignment**: Add and remove roles from users
- **User Information**: Get detailed user profiles and statistics
- **Member Management**: List and manage server members

### 🛡️ Moderation Tools

- **Message Deletion**: Remove inappropriate content with audit trails
- **User Timeouts**: Temporarily restrict user participation
- **Audit Logging**: Track moderation actions with detailed reasons

## 📋 Prerequisites

- **Node.js** 18.0.0 or higher
- **Discord Bot Token** with appropriate permissions
- **MCP-compatible client** (e.g., Claude Desktop)

## 🔧 Installation

### Install via npm (Recommended)

You can install the server directly from npm:

```bash
npm install -g @fukayatti0/discord-mcp-server
```

Or use it with `pnpx` (no global install required):

```bash
pnpx @fukayatti0/discord-mcp-server
```

### Manual Installation

1. **Clone the repository**:

```bash
git clone https://github.com/fukayatti/discord-mcp-server.git
cd discord-mcp-server
```

2. **Install dependencies**:

```bash
npm install
# or
pnpm install
```

3. **Set up your Discord bot**:

- Visit the [Discord Developer Portal](https://discord.com/developers/applications)
- Create a new application and bot
- Copy the bot token
- Enable required privileged intents:
  - `MESSAGE CONTENT INTENT`
  - `PRESENCE INTENT`
  - `SERVER MEMBERS INTENT`
- Generate an invite URL and add the bot to your server

## ⚙️ Configuration

### Claude Desktop Setup

Edit your Claude Desktop configuration file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

#### Using pnpx (Recommended)

If you installed via npm or want to use without global install, configure as follows:

```json
{
  "mcpServers": {
    "discord": {
      "command": "pnpx",
      "args": ["@fukayatti0/discord-mcp-server"],
      "env": {
        "DISCORD_TOKEN": "your_discord_token_here"
      }
    }
  }
}
```

#### Using local source

```json
{
  "mcpServers": {
    "discord": {
      "command": "node",
      "args": ["/path/to/discord-mcp-server/src/server.js"],
      "env": {
        "DISCORD_TOKEN": "your_bot_token_here"
      }
    }
  }
}
```

#### For global installation

```json
{
  "mcpServers": {
    "discord": {
      "command": "discord-mcp-server",
      "env": {
        "DISCORD_TOKEN": "your_bot_token_here"
      }
    }
  }
}
```

## 🎯 Usage Examples

### Basic Message Operations

```
"Send a welcome message to the #general channel"
"Read the last 20 messages from #announcements"
"Read all messages from #general channel (unlimited)"
"Get messages before message ID 1234567890 for pagination"
"Fetch 500 messages from #discussion using bulk reading"
"Add a 👍 reaction to message ID 1234567890"
```

### Server Management

```
"Get information about this Discord server"
"List all members in the server with their roles"
"Show me all channels in the 'Gaming' category"
```

### Channel Management

```
"Create a new channel called 'project-discussion' in the Development category"
"Delete the #old-channel with reason 'No longer needed'"
"Read messages from all channels in the Support category"
```

### User & Role Management

```
"Add the 'Moderator' role to user ID 987654321"
"Remove the 'Member' role from user ID 123456789"
"Get detailed information about user ID 555666777"
```

### Moderation

```
"Delete message ID 1111222233 for spam and timeout the user for 10 minutes"
"Moderate message ID 4444555566 with reason 'Inappropriate content'"
```

## 🛠️ Available Tools

| Tool                     | Description                                  | Parameters                                                                |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------- |
| `get_server_info`        | Get server information                       | `server` (optional)                                                       |
| `list_members`           | List server members                          | `server` (optional), `limit`                                              |
| `send_message`           | Send message to channel                      | `server` (optional), `channel`, `content`                                 |
| `read_messages`          | Read message history with pagination         | `server` (optional), `channel`, `limit`, `before`, `after`, `around`      |
| `read_messages_bulk`     | Read large amounts of messages automatically | `server` (optional), `channel`, `total_limit`, `unlimited`                |
| `add_reaction`           | Add reaction to message                      | `server` (optional), `channel`, `message_id`, `emoji`                     |
| `add_multiple_reactions` | Add multiple reactions                       | `server` (optional), `channel`, `message_id`, `emojis`                    |
| `remove_reaction`        | Remove reaction                              | `server` (optional), `channel`, `message_id`, `emoji`                     |
| `moderate_message`       | Delete and timeout                           | `server` (optional), `channel`, `message_id`, `reason`, `timeout_minutes` |
| `create_text_channel`    | Create new channel                           | `server` (optional), `name`, `category_id`, `topic`                       |
| `delete_channel`         | Delete channel                               | `server` (optional), `channel`, `reason`                                  |
| `list_category_channels` | List channels in category                    | `server` (optional), `category`                                           |
| `read_category_channels` | Read from category channels                  | `server` (optional), `category`, `limit`                                  |
| `add_role`               | Add role to user                             | `server` (optional), `user_id`, `role_id`                                 |
| `remove_role`            | Remove role from user                        | `server` (optional), `user_id`, `role_id`                                 |
| `get_user_info`          | Get user information                         | `user_id`                                                                 |

## 📖 Advanced Message Reading Features

### Pagination Support

The `read_messages` tool now supports pagination parameters:

- **`before`**: Get messages sent before a specific message ID
- **`after`**: Get messages sent after a specific message ID
- **`around`**: Get messages around a specific message ID

### Unlimited Message Reading

The `read_messages_bulk` tool enables reading large amounts of messages:

- **`total_limit`**: Specify the total number of messages to fetch (automatically paginated)
- **`unlimited: true`**: Fetch all available messages in a channel/thread
- **`total_limit: -1`**: Alternative way to enable unlimited reading

### Thread Support

All message reading tools now support Discord threads:

- Use thread ID as the channel parameter
- Read messages from both regular channels and threads seamlessly

### No Artificial Limits

All previous artificial limits have been removed:

- `read_messages`: No longer limited to 100 messages per request
- `read_category_channels`: No longer limited to 50 messages per channel
- Only Discord API's internal limits apply (100 messages per API call, automatically handled)

## 🔒 Required Bot Permissions

Ensure your Discord bot has these permissions:

- `Send Messages`
- `Read Message History`
- `Add Reactions`
- `Manage Messages` (for moderation)
- `Manage Channels` (for channel management)
- `Manage Roles` (for role management)
- `Moderate Members` (for timeouts)
- `View Channels`

## 🚀 Development

### Running Locally

```bash
# Install dependencies
npm install

# Start the server
npm start

# Development mode with auto-reload
npm run dev
```

### Environment Variables

- `DISCORD_TOKEN` - Your Discord bot token (required)

### Project Structure

```
discord-mcp-server/
├── src/
│   └── server.js       # Main MCP server implementation
├── package.json        # Project configuration
├── README.md           # Documentation
└── .gitignore          # Git ignore rules
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🐛 Troubleshooting

### Common Issues

**Bot not responding:**

- Verify the `DISCORD_TOKEN` is correct
- Check that the bot has necessary permissions
- Ensure privileged intents are enabled in Discord Developer Portal

**Channel/Server not found:**

- Use channel/server IDs instead of names for precision
- Ensure the bot has access to the specified channels
- Check that the bot is a member of the target server

**Permission errors:**

- Review bot permissions in Discord server settings
- Ensure the bot's role is positioned correctly in the role hierarchy
- Verify specific permissions for channels and categories

## 🔗 Links

- **Repository**: [https://github.com/fukayatti/discord-mcp-server](https://github.com/fukayatti/discord-mcp-server)
- **npm package**: [@fukayatti0/discord-mcp-server](https://www.npmjs.com/package/@fukayatti0/discord-mcp-server)
- **Author**: [fukayatti](https://fukayatti0.dev/)
- **MCP Documentation**: [Model Context Protocol](https://modelcontextprotocol.io/)
- **Discord.js**: [https://discord.js.org/](https://discord.js.org/)

---

**Made with ❤️ by [fukayatti](https://fukayatti0.dev/)**
