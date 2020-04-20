import * as React from 'react';
import { View, StyleSheet, TouchableHighlight, Platform, Text, ViewStyle } from 'react-native';

import Colors from '../constants/Colors';
import { Ionicons } from './Icons';
import { StyledText } from './Text';
import { StyledButton, StyledView } from './Views';

type IconProps = React.ComponentProps<typeof Ionicons>;

type Props = {
  style?: ViewStyle;
  onPress?: () => any;
  onLongPress?: () => any;
  title?: string;
  subtitle?: string;
  last?: boolean;
  margins?: boolean;
  icon?: IconProps['name'];
  iconStyle?: any;
  //image?: any;
  //imageStyle?: any;
  checked?: boolean;
  arrowForward?: boolean;
  rightContent?: React.ReactNode;
};

export default class ListItem extends React.PureComponent<Props> {
  /*
  \<Ionicons name="md-clipboard" size={26} lightColor={Colors.light.text} />
  */

  renderImage() {
    const { icon, iconStyle /*, image, imageStyle*/ } = this.props;
    /*if (image) {
      return <View style={styles.imageContainer}></View>;
    } else */ if (icon) {
      return (
        <View style={styles.iconContainer}>
          <Ionicons
            style={[styles.icon, iconStyle]}
            name={icon}
            lightColor={Colors.light.text}
            darkColor="#fff"
          />
        </View>
      );
    } else {
      return <View style={styles.marginStart} />;
    }
  }

  renderTitle() {
    const { title } = this.props;
    return title ? (
      <StyledText style={styles.titleText} ellipsizeMode="tail" numberOfLines={1}>
        {title}
      </StyledText>
    ) : (
      undefined
    );
  }

  renderSubtitle() {
    const { title, subtitle } = this.props;
    return subtitle ? (
      <Text
        style={[styles.subtitleText, !title ? styles.subtitleMarginBottom : undefined]}
        ellipsizeMode="tail"
        numberOfLines={title ? 1 : 2}>
        {subtitle}
      </Text>
    ) : (
      undefined
    );
  }

  renderCheck() {
    const { checked } = this.props;
    if (!checked) return;
    return (
      <View style={styles.checkContainer}>
        <Ionicons name="ios-checkmark" size={35} color={Colors.light.tintColor} />
      </View>
    );
  }

  renderArrowForward() {
    const { arrowForward } = this.props;
    if (!arrowForward) return;
    return (
      <View style={styles.arrowForwardContainer}>
        <Ionicons name="ios-arrow-forward" size={22} color={Colors.light.greyText} />
      </View>
    );
    /*<Ionicons
            name="ios-arrow-forward"
            size={22}
            color={Colors.light.greyText}
            style={{ marginTop: -1, marginLeft: 15 }}
          />*/
  }

  renderRightContent() {
    const { rightContent } = this.props;
    if (!rightContent) return;
    return rightContent;
  }

  render() {
    const { onPress, onLongPress, style, last, margins, title, subtitle } = this.props;
    return (
      <View style={[last && margins !== false ? styles.marginBottomLast : undefined, style]}>
        <StyledButton
          onPress={onPress}
          onLongPress={onLongPress}
          fallback={TouchableHighlight}
          underlayColor="#b7b7b7"
          style={[styles.container, last ? styles.containerLast : undefined]}>
          {this.renderImage()}
          <StyledView
            style={[styles.contentContainer, !last ? styles.contentContainerNotLast : undefined]}>
            <View
              style={[
                styles.textContainer,
                title && subtitle ? styles.textContainerBoth : undefined,
              ]}>
              {this.renderTitle()}
              {this.renderSubtitle()}
            </View>
            {this.renderRightContent()}
            {this.renderCheck()}
            {this.renderArrowForward()}
          </StyledView>
        </StyledButton>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    minHeight: 44,
    //paddingHorizontal: 15,
    //paddingTop: 13,
    //paddingBottom: 12,
  },
  containerLast: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  imageContainer: {
    // TODO
  },
  iconContainer: {
    // TODO
    width: 45,
    paddingRight: 2,
    //paddingTop: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 26,
  },
  contentContainer: {
    flex: 1,
    paddingEnd: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  contentContainerNotLast: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  textContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  textContainerBoth: {
    paddingTop: 13,
    paddingBottom: 12,
  },
  titleText: {
    fontSize: 15,
    marginBottom: 2,
    ...Platform.select({
      ios: {
        fontWeight: '500',
      },
      android: {
        fontWeight: '400',
        marginTop: 1,
      },
    }),
  },
  subtitleText: {
    //marginRight: 5,
    //flex: 1,
    color: Colors.light.greyText,
    fontSize: 13,
  },
  subtitleMarginBottom: {
    marginBottom: 2,
  },
  marginStart: {
    marginStart: 15,
  },
  marginBottomLast: {
    marginBottom: 12,
  },
  checkContainer: {
    marginStart: 10,
    //alignSelf: 'center',
  },
  arrowForwardContainer: {
    marginStart: 10,
    //alignSelf: 'center',
  },
});

/*

iconContainer: {
    paddingLeft: IconPaddingLeft,
    paddingRight: IconPaddingRight,
    paddingTop: 12,
    paddingBottom: 10,
  },

margin above title: 13
margin below subtitle: 10

margin-vertical between title & subtitle: 5


*/
