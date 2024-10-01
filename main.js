require('dotenv').config();

const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const admin = require('firebase-admin');
const serviceAccount = require('./src/raidsign.json'); // Your Firebase JSON file

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // Firestore instance

// Initialize Discord Bot
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});


const token = process.env.DISCORD_TOKEN;

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Command to create a new raid
client.on('messageCreate', async (message) => {
    const args = message.content.split(' ');
    if (args[0] === '!newraid') {
      const [difficulty, dateTime, ...raidNameParts] = args.slice(1);
      const raidName = raidNameParts.join(' '); // Join the rest as the raid name
  
      if (!difficulty || !dateTime || !raidName) {
        return message.reply('Please provide the difficulty, date and time, and a name for the raid.');
      }
  
      try {
        // Create a new raid document
        await db.collection('raids').add({
          name: raidName,
          difficulty,
          dateTime,
          createdAt: admin.firestore.FieldValue.serverTimestamp() // Timestamp for ordering
        });
  
        message.reply(`Raid "${raidName}" created successfully!`);
      } catch (error) {
        console.error('Error creating raid:', error);
        message.reply('There was an error creating the raid.');
      }
    }

  // Command for users to sign up for the raid
  if (args[0] === '!signup') {
    const [nameRealm, role, className, ...raidNameParts] = args.slice(1);
    const raidName = raidNameParts.join(' '); // Join the rest as the raid name

    if (!nameRealm || !role || !className || !raidName) {
      return message.reply('Please provide your name-realm, role, class, and the name of the raid.');
    }

    try {
      // Find the raid by name
      const raidQuery = await db.collection('raids').where('name', '==', raidName).get();

      if (raidQuery.empty) {
        return message.reply('No raid found with that name.');
      }

      const raidId = raidQuery.docs[0].id;

      // Create a new signup document for this raid
      await db.collection('raids').doc(raidId).collection('signups').add({
        nameRealm,
        role,
        class: className,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      message.reply(`You have signed up for "${raidName}" as ${role} ${className}!`);
    } catch (error) {
      console.error('Error signing up for raid:', error);
      message.reply('There was an error signing up for the raid.');
    }
  }

  // Command to show all signups for the latest raid
  if (args[0] === '!showraid') {
    const raidName = args.slice(1).join(' '); // Get the raid name from the command

    if (!raidName) {
      return message.reply('Please provide the name of the raid you want to view.');
    }

    try {
      // Find the raid by name
      const raidQuery = await db.collection('raids').where('name', '==', raidName).get();

      if (raidQuery.empty) {
        return message.reply('No raid found with that name.');
      }

      const raidId = raidQuery.docs[0].id;
      const raidData = raidQuery.docs[0].data();

      // Retrieve all signups for the raid
      const signupsSnapshot = await db.collection('raids').doc(raidId).collection('signups').get();

      // Initialize counters for each role
      let tankCount = 0;
      let healerCount = 0;
      let dpsCount = 0;

      // Arrays to hold each role's signups
      const tanks = [];
      const healers = [];
      const dps = [];

      // Count the signups for each role and store them in the respective array
      signupsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.role.toLowerCase() === 'tank') {
          tankCount++;
          tanks.push({ nameRealm: data.nameRealm, role: data.role, class: data.class });
        } else if (data.role.toLowerCase() === 'healer') {
          healerCount++;
          healers.push({ nameRealm: data.nameRealm, role: data.role, class: data.class });
        } else if (data.role.toLowerCase() === 'dps') {
          dpsCount++;
          dps.push({ nameRealm: data.nameRealm, role: data.role, class: data.class });
        }
      });

      // Create the embed with "difficulty date" as title
      const embed = new EmbedBuilder()
        .setTitle(`${raidData.difficulty} ${raidData.dateTime} - "${raidData.name}"`) // Title includes raid name
        .setDescription(`Signups: **${tankCount}/${healerCount}/${dpsCount}** (TANK/HEALER/DPS)`) // Display role counts
        .setColor(0xff0000) // Red color, can change to your preferred color
        .setTimestamp() // Adds the current timestamp
        .setFooter({ text: 'Raid Signups' });

      // Initialize an array to hold fields
      const fields = [];

      // Add tanks to the fields array
      tanks.forEach(tank => {
        fields.push({
          name: `${tank.nameRealm}`,
          value: `**Role:** ${tank.role}\n**Class:** ${tank.class}`,
          inline: true
        });
      });

      // Add healers to the fields array
      healers.forEach(healer => {
        fields.push({
          name: `${healer.nameRealm}`,
          value: `**Role:** ${healer.role}\n**Class:** ${healer.class}`,
          inline: true
        });
      });

      // Add DPS to the fields array
      dps.forEach(dpsMember => {
        fields.push({
          name: `${dpsMember.nameRealm}`,
          value: `**Role:** ${dpsMember.role}\n**Class:** ${dpsMember.class}`,
          inline: true
        });
      });

      // Add fields to embed, limiting to 5 per row
      for (let i = 0; i < fields.length; i += 5) {
        const rowFields = fields.slice(i, i + 5);
        embed.addFields(rowFields);
      }

      // Send the embed
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching raid signups:', error);
      message.reply('There was an error fetching raid signups.');
    }
  }
  if (args[0] === '!delraid') {
    const raidName = args.slice(1).join(' '); // Get the raid name from the command

    if (!raidName) {
      return message.reply('Please provide the name of the raid you want to delete.');
    }

    try {
      // Find the raid by name
      const raidQuery = await db.collection('raids').where('name', '==', raidName).get();

      if (raidQuery.empty) {
        return message.reply('No raid found with that name.');
      }

      // Get the raid document reference
      const raidDoc = raidQuery.docs[0];
      const raidId = raidDoc.id;

      // Delete the raid document and its signups
      await db.collection('raids').doc(raidId).delete();

      message.reply(`Raid "${raidName}" has been deleted successfully.`);
    } catch (error) {
      console.error('Error deleting raid:', error);
      message.reply('There was an error deleting the raid.');
    }
  }
  if (message.content === '!raidlist') {
    try {
      // Retrieve all raids from the database
      const raidsSnapshot = await db.collection('raids').get();

      if (raidsSnapshot.empty) {
        return message.reply('No raids available at the moment.');
      }

      // Create an embed to display the raid list
      const embed = new EmbedBuilder()
        .setTitle('Available Raids')
        .setColor(0x00ff00) // Green color, can change to your preferred color
        .setTimestamp()
        .setFooter({ text: 'Use !showraid {name} to see signups for a raid' });

      // Add each raid to the embed
      raidsSnapshot.forEach(doc => {
        const data = doc.data();

        // Ensure the necessary fields are present
        const raidName = data.name || 'Unknown Raid'; // Default to 'Unknown Raid' if name is undefined
        const difficulty = data.difficulty || 'N/A'; // Default to 'N/A' if difficulty is undefined
        const dateTime = data.dateTime || 'N/A'; // Default to 'N/A' if dateTime is undefined

        embed.addFields({
          name: raidName,
          value: `**Difficulty:** ${difficulty}\n**Date & Time:** ${dateTime}`,
          inline: false
        });
      });

      // Send the embed
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching raid list:', error);
      message.reply('There was an error fetching the raid list.');
    }
  }
});

client.login(token);
