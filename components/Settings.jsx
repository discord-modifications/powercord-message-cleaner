const { React } = require('powercord/webpack');
const {
   SliderInput,
   RadioGroup
} = require('powercord/components/settings');

module.exports = class Settings extends React.Component {
   constructor() {
      super();

      this.state = {
         editError: null,
         delayExpanded: false
      };
   }

   renderBurst() {
      return (
         <div>
            <SliderInput
               minValue={1}
               maxValue={10}
               stickToMarkers
               markers={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
               defaultValue={3}
               initialValue={this.props.getSetting('chunkSize', 3)}
               onValueChange={(val) => this.props.updateSetting('chunkSize', Math.floor(parseInt(val)))}
               note='Collection size of burst deletion chunks'
               onMarkerRender={(v) => `x${v}`}
            >
               Chunk Size
            </SliderInput>
            <SliderInput
               minValue={500}
               maxValue={1500}
               stickToMarkers
               markers={[500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500]}
               defaultValue={1000}
               initialValue={this.props.getSetting('burstDelay', 1000)}
               onValueChange={(val) => this.props.updateSetting('burstDelay', Math.floor(parseInt(val)))}
               note='Delay between deleting chunks'
               onMarkerRender={(v) => `${Math.floor((v / 1000) * 100) / 100}s`}
            >
               Burst Delay
            </SliderInput>
         </div>
      );
   }

   renderNormal() {
      return (
         <div>
            <SliderInput
               minValue={100}
               maxValue={500}
               stickToMarkers
               markers={[100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200]}
               defaultValue={150}
               initialValue={this.props.getSetting('normalDelay', 150)}
               onValueChange={(val) => this.props.updateSetting('normalDelay', val)}
               note='Delay between deleting messages'
               onMarkerRender={(v) => `${Math.floor(v)}ms`}
            >
               Delete Delay
            </SliderInput>
         </div>
      );
   }

   render() {
      return (
         <div>
            <RadioGroup
               value={this.props.getSetting('mode', 1)}
               onChange={(v) => this.props.updateSetting('mode', v.value)}
               options={[
                  { name: 'Normal: Deletes one message at a time (most stable but slower)', value: 0 },
                  { name: 'Burst: Deletes multiple messages at a time (unstable but fast)', value: 1 }
               ]}
            >
               Deletion Mode
            </RadioGroup>
            <SliderInput
               minValue={500}
               maxValue={1500}
               stickToMarkers
               markers={[150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250]}
               defaultValue={200}
               initialValue={this.props.getSetting('searchDelay', 200)}
               onValueChange={(val) => this.props.updateSetting('searchDelay', Math.floor(parseInt(val)))}
               note='Delay between fetching messages'
               onMarkerRender={(v) => `${Math.floor((v / 1000) * 100) / 100}s`}
            >
               Search Delay
            </SliderInput>
            {this.props.getSetting('mode', 1) ? this.renderBurst() : this.renderNormal()}
         </div>
      );
   }
};
