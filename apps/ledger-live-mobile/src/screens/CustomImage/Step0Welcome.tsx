import React, { useCallback, useState } from "react";
import { StackScreenProps } from "@react-navigation/stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Flex, Text } from "@ledgerhq/native-ui";
import { useTranslation } from "react-i18next";
import { Image, useWindowDimensions } from "react-native";
import CustomImageBottomModal from "../../components/CustomImage/CustomImageBottomModal";
import BottomButtonsContainer from "../../components/CustomImage/BottomButtonsContainer";
import { ScreenName } from "../../const";
import { CustomImageNavigatorParamList } from "../../components/RootNavigator/types/CustomImageNavigator";
import imageSource from "./assets/welcome.png";

const imageDimensions = {
  height: Image.resolveAssetSource(imageSource).height,
  width: Image.resolveAssetSource(imageSource).width,
};

const Step0Welcome: React.FC<
  StackScreenProps<
    CustomImageNavigatorParamList,
    ScreenName.CustomImageStep0Welcome
  >
> = ({ route }) => {
  const [modalOpened, setModalOpened] = useState(false);
  const { t } = useTranslation();

  const { params } = route;

  const { device } = params || {};

  const openModal = useCallback(() => {
    setModalOpened(true);
  }, [setModalOpened]);

  const closeModal = useCallback(() => {
    setModalOpened(false);
  }, [setModalOpened]);

  const { width: screenWidth } = useWindowDimensions();

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
      <Flex flex={1}>
        {imageDimensions ? (
          <Image
            source={imageSource}
            resizeMode="contain"
            style={{
              width: screenWidth,
              height:
                (imageDimensions.height / imageDimensions.width) * screenWidth,
            }}
          />
        ) : null}
        <Flex flex={1} px={7}>
          <Text variant="h4" fontWeight="semiBold" mt={8} textAlign="center">
            {t("customImage.landingPage.title")}
          </Text>
        </Flex>
        <BottomButtonsContainer>
          <Button
            alignSelf="stretch"
            size="large"
            type="main"
            onPress={openModal}
          >
            {t("customImage.landingPage.choosePicture")}
          </Button>
        </BottomButtonsContainer>
      </Flex>
      <CustomImageBottomModal
        device={device}
        isOpened={modalOpened}
        onClose={closeModal}
      />
    </SafeAreaView>
  );
};

export default Step0Welcome;
