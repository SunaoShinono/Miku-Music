/*

  ________.__                        _____.___.___________
 /  _____/|  | _____    ____  ____   \__  |   |\__    ___/
/   \  ___|  | \__  \ _/ ___\/ __ \   /   |   |  |    |   
\    \_\  \  |__/ __ \\  \__\  ___/   \____   |  |    |   
 \______  /____(____  /\___  >___  >  / ______|  |____|   
        \/          \/     \/    \/   \/                  

╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║  ## Created by GlaceYT!                                                ║
║  ## Feel free to utilize any portion of the code                       ║
║  ## DISCORD :  https://discord.com/invite/xQF9f9yUEM                   ║
║  ## YouTube : https://www.youtube.com/@GlaceYt                         ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝


*/

const { ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const config = require("../config.js");

const queueNames = [];
const requesters = new Map();

async function play(client, interaction) {
    try {
        const query = interaction.options.getString('name');

        if (!interaction.member.voice.channelId) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Voice Channel Required')
                .setDescription('❌ นายท่าน ไม่เข้าห้องก่อน แล้ว Miku จะไปอยู่ห้องไหนล่ะคะ เข้าห้องเสียงก่อน แล้วใช้คำสั่งใหม่อีกครั้งนะคะ');

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        // Check if Lavalink nodes are available
        if (!client.riffy.nodes || client.riffy.nodes.size === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('No Lavalink Nodes')
                .setDescription('❌ No available Lavalink nodes to process the request.');

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        // Create the player connection
        const player = client.riffy.createConnection({
            guildId: interaction.guildId,
            voiceChannel: interaction.member.voice.channelId,
            textChannel: interaction.channelId,
            deaf: true
        });

        await interaction.deferReply();

        const resolve = await client.riffy.resolve({ query: query, requester: interaction.user.username });
        if (!resolve || typeof resolve !== 'object') {
            throw new TypeError('Resolve response is not an object');
        }

        const { loadType, tracks, playlistInfo } = resolve;

        if (!Array.isArray(tracks)) {
            throw new TypeError('Expected tracks to be an array');
        }

        if (loadType === 'playlist') {
            for (const track of tracks) {
                track.info.requester = interaction.user.username;
                player.queue.add(track);
                queueNames.push(`[${track.info.title} - ${track.info.author}](${track.info.uri})`);
                requesters.set(track.info.uri, interaction.user.username);
            }

            if (!player.playing && !player.paused) player.play();

        } else if (loadType === 'search' || loadType === 'track') {
            const track = tracks.shift();
            track.info.requester = interaction.user.username;

            player.queue.add(track);
            queueNames.push(`[${track.info.title} - ${track.info.author}](${track.info.uri})`);
            requesters.set(track.info.uri, interaction.user.username);

            if (!player.playing && !player.paused) player.play();
        } else {
            const errorEmbed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('Error')
                .setDescription('❌ แง่ะ หาไม่เจอง่ะ นายท่านพิมพ์ผิดหรือเปล่าอะ');

            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        const randomEmbed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setAuthor({
                name: 'อัพเดทเพลงเรียบร้อยแล้วค่ะ',
                iconURL: config.CheckmarkIcon,
                url: config.SupportServer
            })
            .setDescription('**➡️ คำขอเพลงได้ถูกเพิ่มลงในคิวเพลงเรียบร้อย**\n**➡️ ใช้ปุ่มด้านล่าง เพื่อควบคุมการเล่นเพลง**')
            .setFooter({ text: '🎶 ขอให้สนุกกับเพลงนะคะ' });

        await interaction.followUp({ embeds: [randomEmbed] });

    } catch (error) {
        console.error('Error processing play command:', error);
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Error')
            .setDescription('❌ เอ๊ะ เหมือนว่า Node จะล่มนะคะ ลองติดต่อ [@hatsune_miku_16] เพื่อ Restart Server ที่ Host Miku อยู่ก่อนนะคะ');

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ embeds: [errorEmbed] });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

module.exports = {
    name: "play",
    description: "เล่นเพลง (รองรับ Text Search : Link : Playlist)",
    permissions: "0x0000000000000800",
    options: [{
        name: 'name',
        description: 'เล่นเพลง (รองรับ Text Search : Link : Playlist)',
        type: ApplicationCommandOptionType.String,
        required: true
    }],
    run: play,
    queueNames: queueNames,
    requesters: requesters
};

/*

  ________.__                        _____.___.___________
 /  _____/|  | _____    ____  ____   \__  |   |\__    ___/
/   \  ___|  | \__  \ _/ ___\/ __ \   /   |   |  |    |   
\    \_\  \  |__/ __ \\  \__\  ___/   \____   |  |    |   
 \______  /____(____  /\___  >___  >  / ______|  |____|   
        \/          \/     \/    \/   \/                  

╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║  ## Created by GlaceYT!                                                ║
║  ## Feel free to utilize any portion of the code                       ║
║  ## DISCORD :  https://discord.com/invite/xQF9f9yUEM                   ║
║  ## YouTube : https://www.youtube.com/@GlaceYt                         ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝


*/
