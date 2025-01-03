const { Riffy } = require("riffy");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { queueNames, requesters } = require("./commands/play");
const { Dynamic } = require("musicard");
const config = require("./config.js");
const fs = require("fs");
const path = require("path");

function initializePlayer(client) {
    const nodes = config.nodes.map(node => ({
        name: node.name,
        host: node.host,
        port: node.port,
        password: node.password,
        secure: node.secure,
        reconnectTimeout: 5000,
        reconnectTries: Infinity
    }));

    client.riffy = new Riffy(client, nodes, {
        send: (payload) => {
            const guildId = payload.d.guild_id;
            if (!guildId) return;

            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        },
        defaultSearchPlatform: "ytmsearch",
        restVersion: "v4",
    });

    let currentTrackMessageId = null;
    let collector = null;

    client.riffy.on("nodeConnect", node => {
        console.log(`Node "${node.name}" connected.`);
    });

    client.riffy.on("nodeError", (node, error) => {
        console.error(`Node "${node.name}" encountered an error: ${error.message}.`);
    });

    client.riffy.on("trackStart", async (player, track) => {
        const channel = client.channels.cache.get(player.textChannel);
        const trackUri = track.info.uri;
        const requester = requesters.get(trackUri);

        try {
            const musicard = await Dynamic({
                thumbnailImage: track.info.thumbnail || 'https://example.com/default_thumbnail.png',
                backgroundColor: '#070707',
                progress: 10,
                progressColor: '#FF7A00',
                progressBarColor: '#5F2D00',
                name: track.info.title,
                nameColor: '#FF7A00',
                author: track.info.author || 'Unknown Artist',
                authorColor: '#696969',
            });

            // Save the generated card to a file
            const cardPath = path.join(__dirname, 'musicard.png');
            fs.writeFileSync(cardPath, musicard);

            // Prepare the attachment and embed
            const attachment = new AttachmentBuilder(cardPath, { name: 'musicard.png' });
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: 'กำลังเล่นเพลง',
                    iconURL: 'https://cdn.discordapp.com/emojis/838704777436200981.gif' // Replace with actual icon URL
                })
                .setDescription('🎶 **ควบคุมเพลง:**\n 🔁 `วนซ้ำ`, ❌ `ปิดวนซ้ำ`, ⏭️ `ข้ามเพลง`, 📜 `คิวเพลง`, 🗑️ `เคลียร์คิวเพลง`\n ⏹️ `หยุดเพลงและออก`, ⏸️ `หยุดชั่วคราว`, ▶️ `เล่นต่อ`, 🔊 `เพิ่มเสียง`, 🔉 `ลดเสียง`')
                .setImage('attachment://musicard.png')
                .setColor('#FF7A00');

            // Action rows for music controls
            const actionRow1 = createActionRow1(false);
            const actionRow2 = createActionRow2(false);

            // Send the message and set up the collector
            const message = await channel.send({
                embeds: [embed],
                files: [attachment],
                components: [actionRow1, actionRow2]
            });
            currentTrackMessageId = message.id;

            if (collector) collector.stop(); // Stop any existing collectors
            collector = setupCollector(client, player, channel, message);

        } catch (error) {
            console.error("Error creating or sending music card:", error.message);
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription("⚠️ **Unable to load track card. Continuing playback...**");
            await channel.send({ embeds: [errorEmbed] });
        }
    });

    client.riffy.on("trackEnd", async (player) => {
        await disableTrackMessage(client, player);
        currentTrackMessageId = null;
    });

    client.riffy.on("playerDisconnect", async (player) => {
        await disableTrackMessage(client, player);
        currentTrackMessageId = null;
    });

    client.riffy.on("queueEnd", async (player) => {
        const channel = client.channels.cache.get(player.textChannel);
        if (channel && currentTrackMessageId) {
            const queueEmbed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setDescription('**หมดคิวเพลงที่จะเล่นแล้ว งั้น Miku ไปพักก่อนนะคะ**');
            await channel.send({ embeds: [queueEmbed] });
        }
        player.destroy();
        currentTrackMessageId = null;
    });

    async function disableTrackMessage(client, player) {
        const channel = client.channels.cache.get(player.textChannel);
        if (!channel || !currentTrackMessageId) return;

        try {
            const message = await channel.messages.fetch(currentTrackMessageId);
            if (message) {
                const disabledRow1 = createActionRow1(true);
                const disabledRow2 = createActionRow2(true);
                await message.edit({ components: [disabledRow1, disabledRow2] });
            }
        } catch (error) {
            console.error("Failed to disable message components:", error);
        }
    }
}

function setupCollector(client, player, channel, message) {
    const filter = i => [
        'loopToggle', 'skipTrack', 'disableLoop', 'showQueue', 'clearQueue',
        'stopTrack', 'pauseTrack', 'resumeTrack', 'volumeUp', 'volumeDown'
    ].includes(i.customId);

    const collector = message.createMessageComponentCollector({ filter, time: 600000 }); // Set timeout if desired

    collector.on('collect', async i => {
        await i.deferUpdate();

        const member = i.member;
        const voiceChannel = member.voice.channel;
        const playerChannel = player.voiceChannel;

        if (!voiceChannel || voiceChannel.id !== playerChannel) {
            const vcEmbed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setDescription('🔒 **เหมือนว่านายท่านจะไม่ได้อยู่ห้องเดียวกับ Miku เข้าห้องเสียงก่อน และค่อยใช้คำสั่งอีกครั้งนะคะ**');
            const sentMessage = await channel.send({ embeds: [vcEmbed] });
            setTimeout(() => sentMessage.delete().catch(console.error), config.embedTimeout * 1000);
            return;
        }

        handleInteraction(i, player, channel);
    });

    collector.on('end', () => {
        console.log("Collector stopped.");
    });

    return collector;
}

async function handleInteraction(i, player, channel) {
    switch (i.customId) {
        case 'loopToggle':
            toggleLoop(player, channel);
            break;
        case 'skipTrack':
            player.stop();
            await sendEmbed(channel, "⏭️ **ค่ะ จะเล่นเพลงต่อไปให้ฟังนะคะ**");
            break;
        case 'disableLoop':
            disableLoop(player, channel);
            break;
        case 'showQueue':
            showQueue(channel);
            break;
        case 'clearQueue':
            player.queue.clear();
            await sendEmbed(channel, "🗑️ **เคลียร์คิวเรียบร้อยค่ะ**");
            break;
        case 'stopTrack':
            player.stop();
            player.destroy();
            await sendEmbed(channel, '⏹️ **หยุดเล่นแล้วนะคะ งั้นมิกุขอไปพักก่อนนะคะ บายยยยยย**');
            break;
        case 'pauseTrack':
            if (player.paused) {
                await sendEmbed(channel, '⏸️ **ก็หยุดแล้วนี่ไง ยังจะกดอีก!!!**');
            } else {
                player.pause(true);
                await sendEmbed(channel, '⏸️ **หยุดเล่นชั่วคราวแล้วนะคะ**');
            }
            break;
        case 'resumeTrack':
            if (!player.paused) {
                await sendEmbed(channel, '▶️ **ก็เล่นอยู่นี่ไง เดี๋ยวปั๊ดเหนี่ยวเลยนี่**');
            } else {
                player.pause(false);
                await sendEmbed(channel, '▶️ **เล่นต่อแล้วค่ะ**');
            }
            break;
        case 'volumeUp':
            adjustVolume(player, channel, 20);
            break;
        case 'volumeDown':
            adjustVolume(player, channel, -20);
            break;
    }
}

async function sendEmbed(channel, message) {
    const embed = new EmbedBuilder().setColor(config.embedColor).setDescription(message);
    const sentMessage = await channel.send({ embeds: [embed] });
    setTimeout(() => sentMessage.delete().catch(console.error), config.embedTimeout * 1000);
}

function adjustVolume(player, channel, amount) {
    const newVolume = Math.min(100, Math.max(10, player.volume + amount));
    if (newVolume === player.volume) {
        sendEmbed(channel, amount > 0 ? '🔊 **เร่งเสียงสุดแล้วนะคะ ลำโพงแหก หูฟังพัง Miku จะไม่รับผิดชอบนะคะ**' : '🔉 **ต่ำกว่านี้ ก็ไม่มีมนุษย์คนไหนได้ยินเสียงแล้วค่ะ**');
    } else {
        player.setVolume(newVolume);
        sendEmbed(channel, `🔊 **ระดับเสียงปัจจุบันคือ ${newVolume}% ค่ะ**`);
    }
}
function formatTrack(track) {
    if (!track || typeof track !== 'string') return track;
    
 
    const match = track.match(/\[(.*?) - (.*?)\]\((.*?)\)/);
    if (match) {
        const [, title, author, uri] = match;
        return `[${title} - ${author}](${uri})`;
    }
    
  
    return track;
}


function toggleLoop(player, channel) {
    player.setLoop(player.loop === "track" ? "queue" : "track");
    sendEmbed(channel, player.loop === "track" ? "🔁 **เปิด Loop เป็นเพลงเดียวแล้วค่ะ**" : "🔁 **เปิด Loop เป็นคิวเพลงแล้วค่ะ**");
}

function disableLoop(player, channel) {
    player.setLoop("none");
    sendEmbed(channel, "❌ **ปิด Loop ทั้งหมดเรียบร้อยค่ะ**");
}

function showQueue(channel) {
    if (queueNames.length === 0) {
        sendEmbed(channel, "กระดาษคิวเพลงอย่างโล่งเลยค่ะ");
        return;
    }

    const nowPlaying = `🎵 **กำลังเล่น:**\n${formatTrack(queueNames[0])}`;
    const queueChunks = [];

    // Split the queue into chunks of 10 songs per embed
    for (let i = 1; i < queueNames.length; i += 10) {
        const chunk = queueNames.slice(i, i + 10)
            .map((song, index) => `${i + index}. ${formatTrack(song)}`)
            .join('\n');
        queueChunks.push(chunk);
    }

    // Send the "Now Playing" message first
    channel.send({
        embeds: [new EmbedBuilder().setColor(config.embedColor).setDescription(nowPlaying)]
    }).catch(console.error);

    // Send each chunk as a separate embed
    queueChunks.forEach(async (chunk) => {
        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setDescription(`📜 **คิวเพลง:**\n${chunk}`);
        await channel.send({ embeds: [embed] }).catch(console.error);
    });
}


function createActionRow1(disabled) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId("loopToggle").setEmoji('🔁').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId("disableLoop").setEmoji('❌').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId("skipTrack").setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId("showQueue").setEmoji('📜').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId("clearQueue").setEmoji('🗑️').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        );
}

function createActionRow2(disabled) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId("stopTrack").setEmoji('⏹️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
            new ButtonBuilder().setCustomId("pauseTrack").setEmoji('⏸️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId("resumeTrack").setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId("volumeUp").setEmoji('🔊').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId("volumeDown").setEmoji('🔉').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        );
}

module.exports = { initializePlayer };
