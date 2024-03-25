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
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
const GarageDoorStates = {
  Unknown: -1,
  Opened: 0,
  Closed: 1,
  Opening: 2,
  Closing: 3,
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
  ][state];
};

interface GarageDoorState {
  targetDoorState: CharacteristicValue;
  currentDoorState: CharacteristicValue;
  currentAsText(): string;
  targetAsText(): string;
}

interface GarageDoorResult {
  distance: number;
  garageClosed: number;
  garageOpened: number;
  garageState: number;
}

type GarageDoorConfig = {
  doorNodeUrl: string;
  name: string;
  refreshTimeoutInSeconds: number;
  maximumDurationInSeconds: number;
} | AccessoryConfig;

export class GarageDoorAccessory implements AccessoryPlugin {
  private http: AxiosInstance;
  private timer?: NodeJS.Timeout;
  private timerLaunch = 0;
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

  getServices(): Service[] {
    return [ this.informationService, this.service ];
  }

  async onSet(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    const { state, toggleUrl, log, api, service, http } = this;
    const { Characteristic } = api.hap;
    state.targetDoorState = value;
    log.info('Setting target door state ->', state.targetAsText());

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

    service.getCharacteristic(Characteristic.TargetDoorState)
      .updateValue(value);

    this.startStateTimer();
  }

  startStateTimer(): void {
    const { config } = this;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.timerLaunch = new Date().getTime();
    this.timer = setTimeout(() => this.timeout(), config.refreshTimeoutInSeconds * 1000);
  }

  async timeout() {
    const { config, state, log } = this;
    const now = new Date().getTime();
    const runtimeInSeconds = (now - this.timerLaunch) / 1000;
    if (runtimeInSeconds > config.maximumDurationInSeconds) {
      log.debug(
        `Target state not reached yet, aborting. Target: ${this.getStateLog(state.targetDoorState)}, ` +
        `Current: ${this.getStateLog(state.targetDoorState)}`);
      return;
    }

    try {
      await this.onGet();
    } catch (error) {
      log.debug('Timer state update failed.', error);
    }

    if (state.currentDoorState === state.targetDoorState) {
      log.debug(
        `Target state reached. ${this.getStateLog(state.targetDoorState)}`);
      return;
    }
    log.debug(
      `Target state not reached yet. Target: ${this.getStateLog(state.targetDoorState)}, ` +
      `Current: ${this.getStateLog(state.targetDoorState)}`);
    this.timer = setTimeout(() => this.timeout(), config.refreshTimeoutInSeconds * 1000);
  }

  async onGet(): Promise<CharacteristicValue> {
    const { state, api, config, log, http } = this;
    const { Characteristic } = api.hap;
    const { targetDoorState, currentDoorState } = state;
    const nodeUrl = config.doorNodeUrl;
    log.debug('Node Url', nodeUrl);
    const result = await http.get<GarageDoorResult>(this.config.doorNodeUrl);
    if (result.status !== 200) {
      throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const { garageOpened, garageClosed } = result.data;
    let doorState = GarageDoorStates.Unknown;
    if (garageOpened === 1) {
      doorState = GarageDoorStates.Opened;
    } else if (garageClosed === 1) {
      doorState = GarageDoorStates.Closed;
    } else {
      if (targetDoorState === GarageDoorStates.Opened) {
        doorState = GarageDoorStates.Opening;
      } else {
        doorState = GarageDoorStates.Closing;
      }
    }
    if (currentDoorState !== doorState) {
      this.log.info(
        `Door state change from ${state.currentAsText()} ` +
        `to ${this.getStateLog(doorState)}`);
    }
    state.currentDoorState = doorState;
    this.service
      .getCharacteristic(Characteristic.CurrentDoorState)
      .updateValue(doorState);
    return doorState;
  }
}
