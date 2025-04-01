/*
Copyright 2024 The Karmada Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"k8s.io/klog/v2"

	"github.com/karmada-io/dashboard/cmd/api/app/router"
	v1 "github.com/karmada-io/dashboard/cmd/api/app/types/api/v1"
	"github.com/karmada-io/dashboard/cmd/api/app/types/common"
)

func handleLogin(c *gin.Context) {
	loginRequest := new(v1.LoginRequest)
	if err := c.Bind(loginRequest); err != nil {
		klog.ErrorS(err, "Could not read login request")
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  err.Error(),
			Data: nil,
		})
		return
	}
	response, statusCode, err := login(loginRequest, c.Request)
	if err != nil {
		c.JSON(statusCode, common.BaseResponse{
			Code: statusCode,
			Msg:  err.Error(),
			Data: nil,
		})
		return
	}
	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "success",
		Data: response,
	})
}

func handleMe(c *gin.Context) {
	response, statusCode, err := me(c.Request)
	if err != nil {
		c.JSON(statusCode, common.BaseResponse{
			Code: statusCode,
			Msg:  err.Error(),
			Data: nil,
		})
		return
	}
	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "success",
		Data: response,
	})
}

func handleInitToken(c *gin.Context) {
	initTokenRequest := new(v1.InitTokenRequest)
	if err := c.Bind(initTokenRequest); err != nil {
		klog.ErrorS(err, "Could not read init token request")
		c.JSON(http.StatusBadRequest, common.BaseResponse{
			Code: http.StatusBadRequest,
			Msg:  err.Error(),
			Data: nil,
		})
		return
	}
	response, statusCode, err := initToken(initTokenRequest, c.Request)
	if err != nil {
		c.JSON(statusCode, common.BaseResponse{
			Code: statusCode,
			Msg:  err.Error(),
			Data: nil,
		})
		return
	}
	c.JSON(http.StatusOK, common.BaseResponse{
		Code: http.StatusOK,
		Msg:  "success",
		Data: response,
	})
}

func init() {
	router.V1().POST("/login", handleLogin)
	router.V1().GET("/me", handleMe)
	router.V1().POST("/init-token", handleInitToken)
}
