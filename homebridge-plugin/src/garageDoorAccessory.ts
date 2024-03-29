import {
  Service,
  CharacteristicValue,
  Logging,
  API,
  AccessoryPlugin,
  AccessoryConfig,
} from 'homebridge';
import axios, { AxiosInstance } from 'axios';
import { ACCESSORY_NAME } from './settings';
/**
 * GarageDoor Accessory.
 */
const GarageDoorStates = {
  Unknown: -1,
  Opened: 0,
  Closed: 1,
  Opening: 2,
  Closing: 3,
  Stopped: 4,
};

const getGarageDoorStateAsText = (state: CharacteristicValue): string => {
  if (typeof state !== 'number'|| state < 0 || state > 3) {
    return 'Unknown';
  }
  return [
    'Opened',
    'Closed',
    'Opening',
    'Closing',
    'Stopped',
  ][state];
};

interface GarageDoorState {
  targetDoorState: CharacteristicValue;
  currentDoorState: CharacteristicValue;
  currentAsText(): string;
  targetAsText(): string;
}

interface GarageDoorResult {
  garageClosed: number;
  garageOpened: number;
}

type GarageDoorConfig = {
  doorNodeUrl: string;
  name: string;
  refreshTimeoutInSeconds: number;
  maximumDurationInSeconds: number;
} | AccessoryConfig;

export class GarageDoorAccessory implements AccessoryPlugin {
  private http: AxiosInstance;
  private timeout?: NodeJS.Timeout;
  private timeoutLaunch = 0;
  private toggleUrl: string;
  private service: Service;
  private informationService: Service;
  private state: GarageDoorState = {
    currentDoorState: GarageDoorStates.Unknown,
    targetDoorState: GarageDoorStates.Unknown,
    currentAsText: () => {
      return this.getStateLog(this.state.currentDoorState);
    },
    targetAsText: () => {
      return this.getStateLog(this.state.targetDoorState);
    },
  };

  private getStateLog(state: CharacteristicValue): string {
    return `${getGarageDoorStateAsText(state)} (${state})`;
  }

  constructor(
    private log: Logging,
    private config: GarageDoorConfig,
    private api: API,
  ) {
    const { Characteristic } = api.hap;
    this.http = axios.create();
    this.toggleUrl = config.doorNodeUrl + '/relay';
    this.informationService = new api.hap.Service.AccessoryInformation();
    this.service = new api.hap.Service.GarageDoorOpener(
      config.name,
    );
    // set accessory information
    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, 'Jens Marchewka')
      .setCharacteristic(Characteristic.Model, ACCESSORY_NAME)
      .setCharacteristic(Characteristic.SerialNumber, '1.0.0');

    // register handlers for Characteristics
    this.service.getCharacteristic(Characteristic.TargetDoorState)
      .onSet(this.onSet.bind(this))
      .onGet(this.onGet.bind(this));

    log.debug(`Initialized accessory ${config.name} with config`, config);
  }

  // homebridge interface
  getServices(): Service[] {
    return [ this.informationService, this.service ];
  }

  // sets the target door state toggles the relay and initializes a state watcher
  async onSet(value: CharacteristicValue) {
    const { state, toggleUrl, log, api, service, http } = this;
    const { Characteristic } = api.hap;

    // set new target state
    state.targetDoorState = value;
    log.info('Setting target door state ->', state.targetAsText());

    // toggle the relay, just retry a bit if it failes.
    for (let i = 1; i <= 5; i++) {
      let status = -1;
      const result = await http.post(toggleUrl, {toggle: true});
      status = result.status;
      if (status !== 200) {
        log.error(`Attempt ${i} to set target state to ${state.targetAsText()} failed. HttpStatusCode = ${status}`);
        continue;
      }
      break;
    }

    // write state
    service.getCharacteristic(Characteristic.TargetDoorState)
      .updateValue(value);

    // start state watching
    this.startStateWatcher();
  }

  // starts the state watcher
  startStateWatcher(): void {
    const { config } = this;
    if (this.timeout !== undefined) {
      clearTimeout(this.timeout);
    }
    this.timeoutLaunch = new Date().getTime();
    this.timeout = setTimeout(() => this.stateWatch(), config.refreshTimeoutInSeconds * 1000);
  }

  async stateWatch() {
    const { api, config, state, log, service } = this;
    const { Characteristic } = api.hap;
    const now = new Date().getTime();
    const runtimeInSeconds = (now - this.timeoutLaunch) / 1000;
    if (runtimeInSeconds > config.maximumDurationInSeconds) {
      // we are over the configured due for reaching the target state,
      // something went wrong. At this point the state handling might be
      // wacky but this can be fixed by triggering once again. On the other
      // hand there could be a real obstruction.
      if (state.currentDoorState !== GarageDoorStates.Opened
        && state.currentDoorState !== GarageDoorStates.Closed) {
        // so when we have not reached any of the testable states
        // we assume an obstruction and inform about that. And assume
        // that the door has come to a hold.
        service.getCharacteristic(Characteristic.ObstructionDetected)
          .setValue(true);
        service.getCharacteristic(Characteristic.CurrentDoorState)
          .setValue(GarageDoorStates.Stopped);
        state.currentDoorState = GarageDoorStates.Stopped;
        log.error('Obstruction detected, door did not reach target state nor the opposite within the given time of ' +
          `${config.maximumDurationInSeconds} seconds.`);
        return;
      }
      if (state.currentDoorState === GarageDoorStates.Opened
        || state.currentDoorState === GarageDoorStates.Closed) {
        // So we reached the opposite state? we could just run onSet with
        // the target state again but for now we just stop here.
        // i dont want any non "outside" state triggering for now.
        // what if the drive train somehow stopped working? we would trigger
        // runs until infinity so that would need to be watched too...
        log.debug(
          `Opposite state reached, aborting. Target: ${this.getStateLog(state.targetDoorState)}, ` +
          `Current: ${this.getStateLog(state.currentDoorState)}`);
        return;
      }
      // Unknown state.
      log.debug(
        `Target state not reached yet, aborting. Target: ${this.getStateLog(state.targetDoorState)}, ` +
        `Current: ${this.getStateLog(state.currentDoorState)}`);
      return;
    }

    // update the current door state, we have time, we are watching, don't
    // be to edgy on exceptions.
    try {
      await this.onGet();
    } catch (error) {
      log.debug('Timer state update failed.', error);
    }

    if (state.currentDoorState === state.targetDoorState) {
      // the target state has been reached, stop watching and inform.
      log.debug(
        `Target state reached. ${this.getStateLog(state.targetDoorState)}`);
      return;
    }

    // the target state was not reached yet, watch again.
    log.debug(
      `Target state not reached yet. Target: ${this.getStateLog(state.targetDoorState)}, ` +
      `Current: ${this.getStateLog(state.targetDoorState)}`);
    this.timeout = setTimeout(() => this.stateWatch(), config.refreshTimeoutInSeconds * 1000);
  }

  async onGet(): Promise<CharacteristicValue> {
    const { state, api, config, log, http, service } = this;
    const { Characteristic } = api.hap;
    const { targetDoorState, currentDoorState } = state;
    const nodeUrl = config.doorNodeUrl;
    log.debug('Node Url', nodeUrl);
    const result = await http.get<GarageDoorResult>(this.config.doorNodeUrl);
    if (result.status !== 200) {
      // inform hbs about a communication error.
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const { garageOpened, garageClosed } = result.data;
    let doorState = GarageDoorStates.Unknown;
    if (garageOpened === 1) {
      // garage is open.
      doorState = GarageDoorStates.Opened;
    } else if (garageClosed === 1) {
      // garage is closed.
      doorState = GarageDoorStates.Closed;
    } else {
      // so when nothing of both is fittig we are either moving in any direction or we are obstructed.
      if (service.getCharacteristic(Characteristic.ObstructionDetected).value) {
        // we are obstructed
        doorState = GarageDoorStates.Stopped;
      } else if (targetDoorState === GarageDoorStates.Opened) {
        // if we are not obstructed and the target state is open lets assume we are moving that way.
        doorState = GarageDoorStates.Opening;
      } else {
        // or we are moving the other way, also assumed.
        doorState = GarageDoorStates.Closing;
      }
    }

    if (currentDoorState !== doorState) {
      // inform about the state change.
      log.info(
        `Door state change from ${state.currentAsText()} ` +
        `to ${this.getStateLog(doorState)}`);
      if (doorState === GarageDoorStates.Opened
        || doorState === GarageDoorStates.Closed) {
        // when we are open OR closed assumption is over reset obstruction state
        service.getCharacteristic(Characteristic.ObstructionDetected)
          .setValue(false);
        log.debug('Unset obstruction state.');
      }
    }

    // write store and return detected or assumed state.
    state.currentDoorState = doorState;
    service
      .getCharacteristic(Characteristic.CurrentDoorState)
      .updateValue(doorState);
    return doorState;
  }
}
