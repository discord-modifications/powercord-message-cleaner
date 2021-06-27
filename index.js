const GenericRequest = require('../../../fake_node_modules/powercord/http/GenericRequest');
const { getModule } = require('powercord/webpack');
const { Plugin } = require('powercord/entities');
const { get, del } = require('powercord/http');
const { sleep } = require('powercord/util');
const patch = (url) => {
   return new GenericRequest('PATCH', url);
};

const { getChannelId } = getModule(['getLastSelectedChannelId'], false);
const { getChannel } = getModule(['getChannel'], false);
const { getUser } = getModule(['getUser'], false);
const { getGuild } = getModule(['getGuild'], false);
const { getCurrentUser } = getModule(['getCurrentUser'], false);
const { getToken } = getModule(['getToken'], false);
const ChannelStore = getModule(['openPrivateChannel'], false);
const { transitionTo } = getModule(['transitionTo'], false);

let toastIds = {
   noAmount: 'message-cleaner-no-amount',
   stillRunning: 'message-cleaner-still-running',
   noAmountParsed: 'message-cleaner-no-amount',
   finished: 'message-cleaner-finished'
};

module.exports = class MessageCleaner extends Plugin {
   startPlugin() {
      this.pruning = {};

      if (!Array.prototype.chunk) {
         Object.defineProperty(Array.prototype, 'chunk', {
            value: function (size) {
               var array = [];
               for (var i = 0; i < this.length; i += size) {
                  array.push(this.slice(i, i + size));
               }
               return array;
            }
         });
      }

      if (!this.settings.get('aliases')) {
         this.settings.set('aliases', ['prune', 'purge', 'cl', 'pr']);
      }

      powercord.api.commands.registerCommand({
         command: 'clear',
         aliases: this.settings.get('aliases'),
         description: 'Clears a certain amount of messages.',
         usage: '{c} (amount) [beforeMessageId]',
         executor: this.clear.bind(this)
      });

      powercord.api.settings.registerSettings('message-cleaner', {
         category: this.entityID,
         label: 'Message Cleaner',
         render: require('./components/Settings')
      });
   }

   pluginWillUnload() {
      powercord.api.commands.unregisterCommand('clear');
      powercord.api.settings.unregisterSettings('message-cleaner');
   }

   async clear(args) {
      let channel = getChannelId();
      this.clearToasts(channel);

      if (args.length === 0) {
         return powercord.api.notices.sendToast(`${toastIds.noAmount}-${channel}`, {
            header: 'Please specify an amount.',
            type: 'danger'
         });
      }

      if (this.pruning[channel] == true) {
         return powercord.api.notices.sendToast(`${toastIds.stillRunning}-${channel}`, {
            header: 'Already pruning in this channel.',
            type: 'danger'
         });
      }

      let count = args.shift();
      let before = args.shift();

      this.pruning[channel] = true;

      if (count !== 'all') {
         count = parseInt(count);
      }

      if (Number.isNaN(count) || count <= 0) {
         return powercord.api.notices.sendToast(`${toastIds.noAmountParsed}-${channel}`, {
            header: 'Please specify an amount.',
            type: 'danger'
         });
      }

      let action = this.settings.get('action', 0);
      let amount = this.settings.get('mode', 1) ? await this.burstDelete(count, before, channel, action) : await this.normalDelete(count, before, channel, action);

      delete this.pruning[channel];

      this.clearToasts(channel);

      if (amount !== 0) {
         let location = channel;
         let instance = await getChannel(location);
         if (instance.type == 0) {
            let guild = getGuild(instance.guild_id);
            location = `in ${guild.name} > #${instance.name}`;
         } else if (instance.type == 1) {
            let user = await getUser(instance.recipients[0]);
            location = `in DMs with ${user.username}#${user.discriminator}`;
         } else if (instance.type == 3) {
            if (instance.name.length == 0) {
               let users = [];
               for (let user of instance.recipients) {
                  user = await getUser(user);
                  users.push(user);
               }
               location = `in group with ${users.map(u => `${u.username}#${u.discriminator}`)}`;
            } else {
               location = `in group ${instance.name}`;
            }
         }

         return powercord.api.notices.sendToast(`${toastIds.finished}-${channel}`, {
            header: 'Finished Clearing Messages',
            content: `Cleared ${amount} messages ${location}`,
            type: 'success',
            buttons: [
               {
                  text: `Jump to ${instance.type == 0 ? `#${instance.name}` : instance.type == 3 ? 'Group' : 'DM'}`,
                  color: 'brand',
                  size: 'small',
                  look: 'outlined',
                  onClick: () => {
                     if (instance.type == 1) return ChannelStore.openPrivateChannel(instance.recipients[0]);
                     transitionTo(`/channels/${instance.guild_id || '@me'}/${instance.id}`);
                  }
               },
               {
                  text: 'Dismiss',
                  color: 'red',
                  size: 'small',
                  look: 'outlined'
               }
            ]
         });
      } else {
         return powercord.api.notices.sendToast(this.random(20), {
            header: 'No messages found.',
            type: 'danger'
         });
      }
   }

   async normalDelete(count, before, channel, mode) {
      let deleted = 0;
      let offset = 0;
      while (count == 'all' || count > deleted) {
         if (count !== 'all' && count === deleted) break;
         let get = await this.fetch(channel, getCurrentUser().id, before, offset);
         if (get.messages.length <= 0 && get.skipped == 0) break;
         offset = get.offset;
         while (count !== 'all' && count < get.messages.length) get.messages.pop();
         for (const msg of get.messages) {
            await sleep(this.settings.get('normalDelay', 150));
            deleted += await this.deleteMsg(msg.id, channel, mode);
         }
      }
      return deleted;
   }

   async burstDelete(count, before, channel, mode) {
      let deleted = 0;
      let offset = 0;
      while (count == 'all' || count > deleted) {
         if (count !== 'all' && count === deleted) break;
         let get = await this.fetch(channel, getCurrentUser().id, before, offset);
         if (get.messages.length <= 0 && get.skipped == 0) break;
         offset = get.offset;
         while (count !== 'all' && count < get.messages.length) get.messages.pop();
         let chunk = get.messages.chunk(this.settings.get('chunkSize', 3));
         for (const msgs of chunk) {
            let funcs = [];
            for (const msg of msgs) {
               funcs.push(async () => {
                  return await this.deleteMsg(msg.id, channel, mode);
               });
            }
            await Promise.all(
               funcs.map((f) => {
                  return f().then((amount) => {
                     deleted += amount;
                  });
               })
            );
            await sleep(this.settings.get('burstDelay', 1000));
         }
      }

      return deleted;
   }

   async deleteMsg(id, channel, mode) {
      let deleted = 0;
      let func = mode ? patch : del;
      await func(`https://discord.com/api/v6/channels/${channel}/messages/${id}`)
         .set('User-Agent', navigator.userAgent)
         .set('Content-Type', 'application/json')
         .set('Authorization', getToken())
         .send({ content: this.settings.get('editMessage', '⠀') })
         .then(() => {
            deleted++;
         })
         .catch(async (err) => {
            switch (err.statusCode) {
               case 404:
                  this.log(`Can't delete ${id} (Already deleted?)`);
                  break;
               case 429:
                  this.log(`Ratelimited while deleting ${id}. Waiting ${err.body.retry_after}ms`);
                  await sleep(err.body.retry_after);
                  deleted += await this.deleteMsg(id, channel, mode);
                  break;
               default:
                  this.log(`Can't delete ${id} (Response: ${err.statusCode} | ${err.body})`);
                  break;
            }
         });
      return deleted;
   }

   async fetch(channel, user, before, offset) {
      let out = [];
      let messages = await get(
         `https://discord.com/api/v6/channels/${channel}/messages/search?author_id=${user}${before ? `&max_id=${before}` : ''}${offset > 0 ? `&offset=${offset}` : ''}`
      )
         .set('User-Agent', navigator.userAgent)
         .set('Authorization', getToken())
         .catch(async (err) => {
            switch (err.statusCode) {
               case 429:
                  this.log(`Ratelimited while fetching. Waiting ${err.body.retry_after}ms`);
                  await sleep(err.body.retry_after);
                  return this.fetch(channel, user, before);
               default:
                  this.log(`Couldn't fetch (Response: ${err.statusCode})`);
                  break;
            }
         });
      if (messages?.body?.message?.startsWith('Index')) {
         await sleep(messages.body.retry_after);
         return this.fetch(channel, user, before, offset);
      }

      let msgs = messages?.body?.messages;
      if (!msgs?.length) {
         return {
            messages: [],
            offset: offset,
            skipped: 0
         };
      }

      let skippedMsgs = 0;
      for (let bulk of msgs) {
         bulk = bulk.filter((msg) => msg.hit == true);
         out.push(...bulk.filter((msg) => msg.type === 0 || msg.type === 6));
         skippedMsgs += bulk.filter((msg) => !out.find((m) => m.id === msg.id)).length;
      }

      await sleep(this.settings.get('searchDelay', 200));

      return {
         messages: out.sort((a, b) => b.id - a.id),
         offset: skippedMsgs + offset,
         skipped: skippedMsgs
      };
   }

   clearToasts(channel) {
      let toasts = document.querySelector('.powercord-toast-container');
      if (toasts) {
         for (let i of (toasts.children ?? [])) {
            let id = toasts.children[i]?.id;
            if (id?.includes('message-cleaner') && id?.includes(channel)) toasts[i].remove();
         }
         for (let t in powercord.api.notices.toasts) {
            if (t.includes('message-cleaner') && t.includes(channel)) delete powercord.api.notices.toasts[t];
         }
      }
   }

   random(length) {
      var result = '';
      var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      var charactersLength = characters.length;
      for (var i = 0; i < length; i++) {
         result += characters.charAt(Math.floor(Math.random() * charactersLength));
      }
      return result;
   }
};