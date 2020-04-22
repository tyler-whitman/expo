import Constants from 'expo-constants';
import * as React from 'react';
import {
  AppState,
  Alert,
  Clipboard,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  withNavigationFocus,
  withNavigation,
  Themed,
  NavigationFocusInjectedProps,
} from 'react-navigation';
import { connect } from 'react-redux';
import semver from 'semver';

import ApiV2HttpClient from '../api/ApiV2HttpClient';
import Connectivity from '../api/Connectivity';
import DevIndicator from '../components/DevIndicator';
import ScrollView from '../components/NavigationScrollView';
import NoProjectTools from '../components/NoProjectTools';
import NoProjectsOpen from '../components/NoProjectsOpen';
import OpenProjectByURLButton from '../components/OpenProjectByURLButton';
import ProjectTools from '../components/ProjectTools';
import SmallProjectCard from '../components/SmallProjectCard';
import { SectionLabelText, StyledText } from '../components/Text';
import { SectionLabelContainer, GenericCardBody, GenericCardContainer } from '../components/Views';
import Colors from '../constants/Colors';
import SharedStyles from '../constants/SharedStyles';
import HistoryActions from '../redux/HistoryActions';
import { DevSession, StoreData, HistoryList } from '../types';
import Environment from '../utils/Environment';
import addListenerWithNativeCallback from '../utils/addListenerWithNativeCallback';
import extractReleaseChannel from '../utils/extractReleaseChannel';
import getSnackId from '../utils/getSnackId';

const IS_RESTRICTED = Environment.IsIOSRestrictedBuild;
const PROJECT_UPDATE_INTERVAL = 10000;

const SupportedExpoSdks = Constants.supportedExpoSdks || [];

type Props = NavigationFocusInjectedProps & {
  dispatch: (any) => any;
  recentHistory: HistoryList;
  allHistory: HistoryList;
  isAuthenticated: boolean;
};

type State = {
  projects: DevSession[];
  isNetworkAvailable: boolean;
  isRefreshing: boolean;
};

@withNavigationFocus
@withNavigation
@connect(data => ProjectsScreen.getDataProps(data))
export default class ProjectsScreen extends React.Component<Props, State> {
  private _projectPolling?: number;

  static navigationOptions = {
    title: 'Projects',
    ...Platform.select({
      ios: {
        headerRight: () => (Constants.isDevice ? null : <OpenProjectByURLButton />),
      },
    }),
  };

  static getDataProps(data: StoreData) {
    const { history } = data.history;

    return {
      recentHistory: history.take(10),
      allHistory: history,
      isAuthenticated: data.session?.sessionSecret,
    };
  }

  state: State = {
    projects: [],
    isNetworkAvailable: Connectivity.isAvailable(),
    isRefreshing: false,
  };

  componentDidMount() {
    AppState.addEventListener('change', this._maybeResumePollingFromAppState);
    Connectivity.addListener(this._updateConnectivity);
    this._startPollingForProjects();

    // NOTE(brentvatne): if we add QR code button to the menu again, we'll need to
    // find a way to move this listener up to the root of the app in order to ensure
    // that it has been registered regardless of whether we have been on the project
    // screen in the home app
    addListenerWithNativeCallback('ExponentKernel.showQRReader', async event => {
      this.props.navigation.showModal('QRCode');
      return { success: true };
    });
  }

  componentWillUnmount() {
    this._stopPollingForProjects();
    AppState.removeEventListener('change', this._maybeResumePollingFromAppState);
    Connectivity.removeListener(this._updateConnectivity);
  }

  render() {
    const { projects } = this.state;

    return (
      <View style={styles.container}>
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={this.state.isRefreshing}
              onRefresh={this._handleRefreshAsync}
            />
          }
          key={Platform.OS === 'ios' ? this.props.allHistory.count() : 'scroll-view'}
          stickyHeaderIndices={Platform.OS === 'ios' ? [0, 2, 4] : []}
          style={styles.container}
          contentContainerStyle={styles.contentContainer}>
          <SectionLabelContainer>
            <SectionLabelText>
              {(Platform.OS === 'ios' && Environment.IOSClientReleaseType === 'SIMULATOR') ||
              (Platform.OS === 'android' && !Constants.isDevice)
                ? 'CLIPBOARD'
                : 'TOOLS'}
            </SectionLabelText>
          </SectionLabelContainer>
          {this._renderProjectTools()}

          <SectionLabelContainer>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <DevIndicator
                style={{ marginRight: 7 }}
                isActive={projects && projects.length}
                isNetworkAvailable={this.state.isNetworkAvailable}
              />
              <SectionLabelText>RECENTLY IN DEVELOPMENT</SectionLabelText>
            </View>
            <TouchableOpacity onPress={this._handlePressHelpProjects} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>HELP</Text>
            </TouchableOpacity>
          </SectionLabelContainer>
          {this._renderProjects()}

          <SectionLabelContainer>
            <SectionLabelText>RECENTLY OPENED</SectionLabelText>
            <TouchableOpacity onPress={this._handlePressClearHistory} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>CLEAR</Text>
            </TouchableOpacity>
          </SectionLabelContainer>

          {this._renderRecentHistory()}
          {this._renderConstants()}
        </ScrollView>

        <Themed.StatusBar />
      </View>
    );
  }

  componentDidUpdate(prevProps: Props) {
    if (!prevProps.isFocused && this.props.isFocused) {
      this._fetchProjectsAsync();
    }

    if (prevProps.isAuthenticated && !this.props.isAuthenticated) {
      // Remove all projects except Snack, because they are tied to device id
      this.setState(({ projects }) => ({
        projects: projects.filter(p => p.source === 'snack'),
      }));
    }
  }

  private _updateConnectivity = (isAvailable: boolean): void => {
    if (isAvailable !== this.state.isNetworkAvailable) {
      this.setState({ isNetworkAvailable: isAvailable });
    }
  };

  private _maybeResumePollingFromAppState = (nextAppState: string): void => {
    if (nextAppState === 'active' && !this._projectPolling) {
      this._startPollingForProjects();
    } else {
      this._stopPollingForProjects();
    }
  };

  private _startPollingForProjects = async () => {
    this._handleRefreshAsync();
    this._projectPolling = setInterval(this._fetchProjectsAsync, PROJECT_UPDATE_INTERVAL);
  };

  private _stopPollingForProjects = async () => {
    clearInterval(this._projectPolling);
    this._projectPolling = undefined;
  };

  private _fetchProjectsAsync = async () => {
    try {
      const api = new ApiV2HttpClient();
      const projects = await api.getAsync('development-sessions', {
        deviceId: getSnackId(),
      });
      this.setState({ projects });
    } catch (e) {
      // this doesn't really matter, we will try again later
      if (__DEV__) {
        console.log(e);
      }
    }
  };

  private _handleRefreshAsync = async () => {
    this.setState({ isRefreshing: true });

    try {
      await Promise.all([
        this._fetchProjectsAsync(),
        new Promise(resolve => setTimeout(resolve, 1000)),
      ]);
    } catch (e) {
      // not sure what to do here, maybe nothing?
    } finally {
      this.setState({ isRefreshing: false });
    }
  };

  private _handlePressHelpProjects = () => {
    if (!this.state.isNetworkAvailable) {
      Alert.alert(
        'No network connection available',
        `You must be connected to the internet to view a list of your projects open in development.`
      );
    }

    const baseMessage = `Make sure you are signed in to the same Expo account on your computer and this app. Also verify that your computer is connected to the internet, and ideally to the same Wi-Fi network as your mobile device. Lastly, ensure that you are using the latest version of Expo CLI. Pull to refresh to update.`;
    const message = Platform.select({
      ios: Constants.isDevice
        ? baseMessage
        : `${baseMessage} If this still doesn't work, press the + icon on the header to type the project URL manually.`,
      android: baseMessage,
    });
    Alert.alert('Troubleshooting', message);
  };

  private _handlePressClearHistory = () => {
    this.props.dispatch(HistoryActions.clearHistory());
  };

  private _renderProjectTools = () => {
    if (IS_RESTRICTED) {
      return (
        <View style={{ marginBottom: 10 }}>
          <NoProjectTools />
        </View>
      );
    } else {
      return <ProjectTools pollForUpdates={this.props.isFocused} />;
    }
  };

  private _renderRecentHistory = () => {
    return this.props.allHistory.count() === 0
      ? this._renderEmptyRecentHistory()
      : this._renderRecentHistoryItems();
  };

  private _renderEmptyRecentHistory = () => {
    return (
      <GenericCardContainer key="empty-history">
        <GenericCardBody>
          <Text style={[SharedStyles.faintText, { textAlign: 'center' }]}>
            You haven't opened any projects recently.
          </Text>
        </GenericCardBody>
      </GenericCardContainer>
    );
  };

  private _renderRecentHistoryItems = () => {
    const extractUsername = manifestUrl => {
      const username = manifestUrl.match(/@.*?\//)[0];
      if (!username) {
        return null;
      } else {
        return username.slice(0, username.length - 1);
      }
    };

    return this.props.recentHistory.map(
      (project, i) =>
        project && (
          <SmallProjectCard
            key={project.manifestUrl}
            iconUrl={project.manifest?.iconUrl}
            releaseChannel={
              /* 28/11/17(brentvatne) - we can remove extractReleaseChannel in a couple of months
          when project history is unlikely to include any projects with release channels */
              (project.manifest && project.manifest.releaseChannel) ||
              extractReleaseChannel(project.manifestUrl)
            }
            platform={project.platform}
            projectName={project.manifest?.name}
            username={
              project.manifestUrl.includes('exp://exp.host')
                ? extractUsername(project.manifestUrl)
                : null
            }
            projectUrl={project.manifestUrl}
            fullWidthBorder={i === this.props.recentHistory.count() - 1}
          />
        )
    );
  };

  private _renderConstants = () => {
    return (
      <View style={styles.constantsContainer}>
        <StyledText
          style={styles.deviceIdText}
          onPress={this._copySnackIdToClipboard}
          lightColor="rgba(0,0,0,0.3)"
          darkColor="rgba(255,255,255,0.6)">
          Device ID: {getSnackId()}
        </StyledText>
        <StyledText
          style={styles.expoVersionText}
          onPress={this._copyClientVersionToClipboard}
          lightColor="rgba(0,0,0,0.3)"
          darkColor="rgba(255,255,255,0.6)">
          Client version: {Constants.expoVersion}
        </StyledText>
        <StyledText
          style={styles.supportSdksText}
          lightColor="rgba(0,0,0,0.3)"
          darkColor="rgba(255,255,255,0.6)">
          Supported SDK
          {SupportedExpoSdks.length === 1 ? ': ' : 's: '}
          {SupportedExpoSdks.map(semver.major)
            .sort((a, b) => a - b)
            .join(', ')}
        </StyledText>
      </View>
    );
  };

  private _copySnackIdToClipboard = () => {
    Clipboard.setString(getSnackId());

    // Should have some integrated alert banner
    alert('The device ID has been copied to your clipboard');
  };

  private _copyClientVersionToClipboard = () => {
    Clipboard.setString(Constants.expoVersion);
    alert('The client version has been copied to your clipboard');
  };

  private _renderProjects = () => {
    const { projects } = this.state;

    if (projects && projects.length) {
      return (
        <View style={styles.inDevelopmentContainer}>
          {projects.map((project, i) => (
            <SmallProjectCard
              icon={
                project.source === 'desktop'
                  ? require('../assets/cli.png')
                  : require('../assets/snack.png')
              }
              projectName={project.description}
              platform={project.platform}
              key={project.url}
              projectUrl={project.url}
              iconBorderStyle={{
                borderWidth: 1,
                borderColor: 'rgba(0, 0, 32, 0.1)',
              }}
              fullWidthBorder={i === projects.length - 1}
            />
          ))}
        </View>
      );
    } else {
      return <NoProjectsOpen isAuthenticated={this.props.isAuthenticated} />;
    }
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inDevelopmentContainer: {
    marginBottom: 15,
  },
  infoContainer: {
    paddingTop: 13,
    flexDirection: 'column',
    alignSelf: 'stretch',
    paddingBottom: 10,
  },
  contentContainer: {
    paddingTop: 5,
  },
  clearButton: {
    alignItems: 'flex-end',
    flex: 1,
  },
  clearButtonText: {
    color: Colors.light.greyText,
    fontSize: 11,
    letterSpacing: 0.92,
    ...Platform.select({
      ios: {
        fontWeight: '500',
      },
    }),
  },
  constantsContainer: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 20,
    justifyContent: 'flex-end',
    alignItems: 'center',
    flex: 1,
  },
  deviceIdText: {
    fontSize: 11,
    marginBottom: 5,
  },
  expoVersionText: {
    fontSize: 11,
    marginBottom: 5,
  },
  supportSdksText: {
    fontSize: 11,
  },
});
